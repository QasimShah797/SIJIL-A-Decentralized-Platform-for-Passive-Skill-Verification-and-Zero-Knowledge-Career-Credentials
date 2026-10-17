/**
 * Applies the assessment migration to an isolated local PostgreSQL 16 database.
 * Docker is used when it can start a container. Otherwise SIJIL_POSTGRES_BIN
 * must point at a directory containing initdb, postgres, and pg_ctl.
 * This test does not read Supabase credentials and does not connect to hosted Supabase.
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import net from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../..");
const container = "sijil-phase2-pg-test";

let cleanup = () => {};

function docker(args, options = {}) {
  return spawnSync("docker", args, { encoding: "utf8", ...options });
}

function dockerCanRun() {
  return docker(["info"]).status === 0;
}

after(() => {
  cleanup();
});

test("local database enforces assessment commitment security", async () => {
  const applySqlText = dockerCanRun()
    ? await startDockerDatabase()
    : await startBinaryDatabase();
  const applySql = (filePath) => applySqlText(readFileSync(filePath), filePath);

  await applySql(path.join(here, "assessment-commitment-fixture.sql"));
  await applySql(path.join(repoRoot, "supabase/migrations/20260629140000_mcq_task_attempts.sql"));
  await applySql(path.join(here, "assessment-commitment-columns.sql"));
  await applySqlText(`
    INSERT INTO auth.users (id) VALUES ('11111111-1111-4111-8111-111111111111');
    INSERT INTO public.mcq_task_attempts (
      id, learner_user_id, competency_name, questions, answer_key, status
    ) VALUES (
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      '11111111-1111-4111-8111-111111111111',
      'Legacy skill',
      '[]'::jsonb,
      '{"sealed":true}'::jsonb,
      'completed'
    );
    CREATE TABLE public.credentials (
      id uuid PRIMARY KEY,
      credential_hash text
    );
    INSERT INTO public.credentials (id, credential_hash)
    VALUES ('99999999-9999-4999-8999-999999999999', 'legacy-hash');
  `, "pre-migration records");
  await applySql(path.join(repoRoot, "supabase/migrations/20261017000000_assessment_commitment.sql"));
  await applySql(path.join(here, "assessment-commitment-security.sql"));
});

async function startDockerDatabase() {
  docker(["rm", "-f", container]);
  const started = docker([
    "run", "-d", "--name", container,
    "-e", "POSTGRES_HOST_AUTH_METHOD=trust",
    "-e", "POSTGRES_DB=sijil_phase2",
    "postgres:16-alpine",
  ]);
  assert.equal(started.status, 0, started.stderr);
  cleanup = () => {
    docker(["rm", "-f", container]);
  };

  let ready = false;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const probe = docker([
      "exec", container, "psql", "-U", "postgres", "-d", "sijil_phase2", "-c", "select 1",
    ]);
    if (probe.status === 0) {
      ready = true;
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  assert.equal(ready, true, "local Postgres did not become ready");

  return (source, label) => {
    const result = docker(
      ["exec", "-i", container, "psql", "-U", "postgres", "-d", "sijil_phase2", "-v", "ON_ERROR_STOP=1"],
      { input: source },
    );
    assert.equal(result.status, 0, `psql failed for ${label}\n${result.stdout}\n${result.stderr}`);
  };
}

async function startBinaryDatabase() {
  const bin = process.env.SIJIL_POSTGRES_BIN;
  assert.ok(bin, "Docker cannot start a database and SIJIL_POSTGRES_BIN is not set");
  const work = mkdtempSync(path.join(tmpdir(), "sijil-phase6a-pg-"));
  const data = path.join(work, "data");
  const socketDir = path.join(work, "sock");
  mkdirSync(socketDir);
  const initialized = spawnSync(path.join(bin, "initdb"), [
    "-D", data, "-U", "postgres", "--auth=trust", "--no-sync",
  ], { encoding: "utf8" });
  assert.equal(initialized.status, 0, initialized.stderr);
  const started = spawnSync(path.join(bin, "pg_ctl"), [
    "-D", data,
    "-l", path.join(work, "server.log"),
    "-w", "start",
    "-o", `-c listen_addresses= -c unix_socket_directories=${socketDir} -c port=5432`,
  ], { encoding: "utf8" });
  assert.equal(started.status, 0, `${started.stdout}\n${started.stderr}`);
  cleanup = () => {
    spawnSync(path.join(bin, "pg_ctl"), ["-D", data, "-w", "-m", "immediate", "stop"], { encoding: "utf8" });
    rmSync(work, { recursive: true, force: true });
  };

  const socketPath = path.join(socketDir, ".s.PGSQL.5432");
  await queryPostgres(socketPath, "postgres", "CREATE DATABASE sijil_phase2");
  return async (source, label) => {
    const sql = Buffer.isBuffer(source) ? source.toString("utf8") : source;
    await queryPostgres(socketPath, "sijil_phase2", sql, label);
  };
}

async function queryPostgres(socketPath, database, sql, label = database) {
  const socket = net.createConnection(socketPath);
  const reader = new ByteReader(socket);
  await new Promise((resolve, reject) => {
    socket.once("connect", resolve);
    socket.once("error", reject);
  });
  const startup = Buffer.concat([
    Buffer.from([0, 3, 0, 0]),
    Buffer.from(`user\0postgres\0database\0${database}\0\0`),
  ]);
  socket.write(Buffer.concat([int32(startup.length + 4), startup]));
  for (;;) {
    const message = await reader.readMessage();
    if (message.type === "Z") break;
    if (message.type === "E") {
      socket.end();
      throw new Error(`Postgres startup failed for ${label}: ${errorText(message.payload)}`);
    }
  }
  const query = Buffer.concat([Buffer.from(sql), Buffer.from([0])]);
  socket.write(Buffer.concat([Buffer.from("Q"), int32(query.length + 4), query]));
  const errors = [];
  for (;;) {
    const message = await reader.readMessage();
    if (message.type === "E") errors.push(errorText(message.payload));
    if (message.type === "Z") break;
  }
  socket.end();
  assert.deepEqual(errors, [], `psql failed for ${label}\n${errors.join("\n")}`);
}

function int32(value) {
  const buffer = Buffer.alloc(4);
  buffer.writeInt32BE(value);
  return buffer;
}

function errorText(payload) {
  const text = payload.toString("utf8");
  const message = text.split("\0").find((field) => field.startsWith("M"));
  return message ? message.slice(1) : text;
}

class ByteReader {
  constructor(socket) {
    this.socket = socket;
    this.buffer = Buffer.alloc(0);
    this.waiters = [];
    socket.on("data", (chunk) => {
      this.buffer = Buffer.concat([this.buffer, chunk]);
      this.drain();
    });
    socket.on("error", (error) => {
      for (const waiter of this.waiters.splice(0)) waiter.reject(error);
    });
    socket.on("end", () => {
      for (const waiter of this.waiters.splice(0)) waiter.reject(new Error("Postgres closed the connection"));
    });
  }

  drain() {
    while (this.waiters.length > 0 && this.buffer.length >= this.waiters[0].size) {
      const waiter = this.waiters.shift();
      const out = this.buffer.subarray(0, waiter.size);
      this.buffer = this.buffer.subarray(waiter.size);
      waiter.resolve(out);
    }
  }

  read(size) {
    if (this.buffer.length >= size) {
      const out = this.buffer.subarray(0, size);
      this.buffer = this.buffer.subarray(size);
      return Promise.resolve(out);
    }
    return new Promise((resolve, reject) => {
      this.waiters.push({ size, resolve, reject });
      this.drain();
    });
  }

  async readMessage() {
    const type = (await this.read(1)).toString("utf8");
    const length = (await this.read(4)).readInt32BE(0);
    return { type, payload: await this.read(length - 4) };
  }
}

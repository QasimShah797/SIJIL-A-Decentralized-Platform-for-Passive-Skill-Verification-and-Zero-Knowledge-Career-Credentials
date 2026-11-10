declare module "snarkjs" {
  export const groth16: {
    fullProve(
      input: Record<string, string>,
      wasmFile: Uint8Array | string,
      zkeyFile: Uint8Array | string,
    ): Promise<{ proof: unknown; publicSignals: string[] }>;
    verify(
      verificationKey: object,
      publicSignals: string[],
      proof: unknown,
    ): Promise<boolean>;
  };
}

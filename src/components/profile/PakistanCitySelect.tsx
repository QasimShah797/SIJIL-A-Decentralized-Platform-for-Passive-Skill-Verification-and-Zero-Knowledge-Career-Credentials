import { useEffect, useId, useState } from "react";
import { ChevronDown } from "lucide-react";
import { Command, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import citiesUrl from "@/data/pakistan-cities.json?url";

export function PakistanCitySelect({ value, onChange }: {
  value: string;
  onChange: (city: string) => void;
}) {
  const selectedCityId = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [places, setPlaces] = useState<string[][]>();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!open || places) return;
    let active = true;
    setFailed(false);
    void (async () => {
      try {
        const response = await fetch(citiesUrl);
        if (!response.ok) throw new Error("City list unavailable");
        const data: string[][] = await response.json();
        if (active) setPlaces(data);
      } catch {
        if (active) setFailed(true);
      }
    })();
    return () => { active = false; };
  }, [open, places]);

  const terms = query.trim().toLowerCase().split(/\s+/);
  const results: string[][] = [];
  for (const place of places ?? []) {
    const label = place.join(" ").toLowerCase();
    if (terms.every((term) => label.includes(term))) results.push(place);
    if (results.length === 60) break;
  }

  return (
    <Popover open={open} onOpenChange={(next) => { setOpen(next); setQuery(""); }}>
      <PopoverTrigger type="button" aria-label="City" aria-describedby={value ? selectedCityId : undefined}
        className="flex w-full items-center justify-between gap-2 pr-3 text-left"
        data-city-trigger>
        <span id={selectedCityId} className="truncate">{value}</span>
        <ChevronDown className="h-4 w-4 shrink-0 opacity-50" aria-hidden="true" />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[var(--radix-popover-trigger-width)] min-w-52 max-w-[calc(100vw-2rem)] p-0" aria-label="Choose a city">
        <Command shouldFilter={false} label="Search Pakistan cities">
          <CommandInput autoFocus value={query} onValueChange={setQuery} />
          <CommandList>
            {results.map(([city, region]) => (
              <CommandItem key={JSON.stringify([city, region])} value={city + ", " + region}
                onSelect={() => { onChange(city); setOpen(false); setQuery(""); }}>
                <span>{city}</span><span className="ml-2 text-xs text-muted-foreground">{region}</span>
              </CommandItem>
            ))}
          </CommandList>
          {!results.length && (
            <p role="status" className="p-3 text-sm">
              {failed ? "Could not load cities. Refresh the page to try again." : places ? "No matching cities." : "Loading cities…"}
            </p>
          )}
          {results.length === 60 && <p className="border-t p-2 text-xs text-muted-foreground">Search by city or region to narrow results.</p>}
        </Command>
      </PopoverContent>
    </Popover>
  );
}

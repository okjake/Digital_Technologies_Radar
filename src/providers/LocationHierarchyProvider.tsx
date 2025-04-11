import React, {
  createContext,
  useContext,
  useMemo,
  ReactNode,
  useCallback
} from 'react';
import { getCode } from 'country-list';
import { useRadarState } from '@undp_sdg_ai_lab/undp-radar';
import { RadarContext } from 'navigation/context';
import geos from 'geos-major';

interface LocationHierarchy {
  regions: Set<string>;
  subregions: Map<string, Set<string>>; // region -> subregions
  countries: Map<string, Set<string>>; // subregion -> countries
  countryToSubregion: Map<string, string>; // country -> subregion
  countryToRegion: Map<string, string>; // country -> region
}

interface LocationHierarchyContextType {
  getPermittedSubregions: () => string[] | undefined;
  getPermittedCountries: () => string[] | undefined;
}

const defaultContext: LocationHierarchyContextType = {
  getPermittedSubregions: () => [],
  getPermittedCountries: () => []
};

const LocationHierarchyContext =
  createContext<LocationHierarchyContextType>(defaultContext);

export const useLocationHierarchy = (): LocationHierarchyContextType => {
  const context = useContext(LocationHierarchyContext);
  if (!context) {
    throw new Error(
      'useLocationHierarchy must be used within a LocationHierarchyProvider'
    );
  }
  return context;
};

interface LocationHierarchyProviderProps {
  children: ReactNode;
}

export const LocationHierarchyProvider: React.FC<
  LocationHierarchyProviderProps
> = ({ children }) => {
  const {
    state: { blips }
  } = useRadarState();
  const { filteredValues } = useContext(RadarContext);

  // Since we know these will only be arrays or undefined
  const selectedRegions = filteredValues?.parameters?.['Region'] || ['all'];
  const selectedSubregions = filteredValues?.parameters?.['Sub Region'] || [
    'all'
  ];

  const locationHierarchy = useMemo(() => {
    const hierarchy: LocationHierarchy = {
      regions: new Set(),
      subregions: new Map(),
      countries: new Map(),
      countryToSubregion: new Map(),
      countryToRegion: new Map()
    };

    // Build the hierarchy from blips
    blips.forEach((blip: any) => {
      const countries = blip['Country of Implementation'];

      countries.forEach((country: string) => {
        if (['Global'].includes(country)) return;

        const code = getCode(country);
        if (!code) return;

        const { continent, subContinent } = geos.country(code);

        // Add to regions set
        hierarchy.regions.add(continent);

        // Add to subregions map
        if (!hierarchy.subregions.has(continent)) {
          hierarchy.subregions.set(continent, new Set());
        }
        hierarchy.subregions.get(continent)?.add(subContinent);

        // Add to countries map
        if (!hierarchy.countries.has(subContinent)) {
          hierarchy.countries.set(subContinent, new Set());
        }
        hierarchy.countries.get(subContinent)?.add(country);

        // Add to lookup maps
        hierarchy.countryToSubregion.set(country, subContinent);
        hierarchy.countryToRegion.set(country, continent);
      });
    });

    return hierarchy;
  }, [blips]);

  const getPermittedSubregions = useCallback((): string[] | undefined => {
    if (selectedRegions.length === 0 || selectedRegions[0] === 'all') {
      return undefined;
    }

    // For multiple selected regions, combine their subregions
    const permittedSubregions = new Set<string>();

    selectedRegions.forEach(({ label }: { label: string }) => {
      const regionSubregions = locationHierarchy.subregions.get(label) || [];

      regionSubregions.forEach((subregion: string) =>
        permittedSubregions.add(subregion)
      );
    });

    return Array.from(permittedSubregions);
  }, [selectedRegions, locationHierarchy]);

  const getPermittedCountries = useCallback((): string[] | undefined => {
    // For multiple selected subregions, combine their countries
    const permittedCountries = new Set<string>();

    if (selectedSubregions.length) {
      selectedSubregions.forEach(({ label }: { label: string }) => {
        const subregionCountries = locationHierarchy.countries.get(label) || [];

        subregionCountries.forEach((country: string) =>
          permittedCountries.add(country)
        );
      });
      return Array.from(permittedCountries);
    }

    if (selectedRegions.length) {
      // Get all subregions for the selected regions
      const subregions = new Set<string>();
      selectedRegions.forEach(({ label }: { label: string }) => {
        const regionSubregions = locationHierarchy.subregions.get(label) || [];
        regionSubregions.forEach((subregion) => subregions.add(subregion));
      });

      // Get all countries for these subregions
      subregions.forEach((subregion) => {
        const subregionCountries =
          locationHierarchy.countries.get(subregion) || [];
        subregionCountries.forEach((country) =>
          permittedCountries.add(country)
        );
      });

      return Array.from(permittedCountries);
    }

    return undefined;
  }, [selectedSubregions, selectedRegions, locationHierarchy]);

  const value = {
    getPermittedSubregions,
    getPermittedCountries
  };

  return React.createElement(
    LocationHierarchyContext.Provider,
    { value },
    children
  );
};

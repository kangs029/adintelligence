export const ACS_RELEASE = "ACS 2024 5-year";
export const ACS_DATASET_PATH = "/data/2024/acs/acs5";
export const ACS_BASE_URL = "https://api.census.gov";
export const ACS_CBSA_GEOGRAPHY =
  "metropolitan statistical area/micropolitan statistical area";

export const ACS_VARIABLES = {
  asianIndian: "B02015_021E",
  asianIndianMoe: "B02015_021M",
  totalPopulation: "B01003_001E",
  totalPopulationMoe: "B01003_001M",
  medianHouseholdIncome: "B19013_001E",
  medianHouseholdIncomeMoe: "B19013_001M",
};

export const ACS_QUERY_VARIABLES = [
  "NAME",
  ACS_VARIABLES.asianIndian,
  ACS_VARIABLES.asianIndianMoe,
  ACS_VARIABLES.totalPopulation,
  ACS_VARIABLES.totalPopulationMoe,
  ACS_VARIABLES.medianHouseholdIncome,
  ACS_VARIABLES.medianHouseholdIncomeMoe,
];

export const TIGERWEB_CBSA_ENDPOINT =
  "https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/CBSA/MapServer";

export const TIGERWEB_ACS_2024_CBSA_LAYERS = [15, 16];

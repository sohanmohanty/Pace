import { createContext } from "react";
import type { Settings } from "../data/types";

// Read settings from the shared App subscription. Separate live queries
// could give navigation and route guards different onboarded values.
export const SettingsContext = createContext<Settings | undefined>(undefined);

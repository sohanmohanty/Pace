import { createContext } from "react";
import type { Settings } from "../data/types";

// The single settings subscription lives in App; consumers must read this
// context instead of running their own live query, so that navigation
// decisions and the route guard can never disagree about `onboarded`.
export const SettingsContext = createContext<Settings | undefined>(undefined);

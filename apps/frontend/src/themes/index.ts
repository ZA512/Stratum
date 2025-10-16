import aurora from "./aurora";
import cyberwave from "./cyberwave";
import midnight from "./midnight";
import solstice from "./solstice";
import velvet from "./velvet";
import type { ThemeDefinition } from "./types";

export const themes: ThemeDefinition[] = [midnight, aurora, solstice, velvet, cyberwave];

export const DEFAULT_THEME = midnight;

export const themeById = new Map<string, ThemeDefinition>(themes.map((theme) => [theme.id, theme]));

export type { ThemeDefinition };

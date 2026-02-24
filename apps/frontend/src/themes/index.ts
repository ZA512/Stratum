import aurora from "./aurora";
import cyberwave from "./cyberwave";
import draculaDark from "./dracula-dark";
import midnight from "./midnight";
import materialDark from "./material-dark";
import materialLight from "./material-light";
import nordDark from "./nord-dark";
import obsidianFlux from "./obsidian-flux";
import solstice from "./solstice";
import solarizedLight from "./solarized-light";
import velvet from "./velvet";
import vulcanEmber from "./vulcan-ember";
import arcticPulse from "./arctic-pulse";
import solarForge from "./solar-forge";
import type { ThemeDefinition } from "./types";

export const themes: ThemeDefinition[] = [
	midnight,
	aurora,
	solstice,
	velvet,
	cyberwave,
	materialLight,
	solarizedLight,
	materialDark,
	nordDark,
	draculaDark,
	obsidianFlux,
	vulcanEmber,
	arcticPulse,
	solarForge,
];

export const DEFAULT_THEME = midnight;

export const themeById = new Map<string, ThemeDefinition>(themes.map((theme) => [theme.id, theme]));

export type { ThemeDefinition };

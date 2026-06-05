// Minimal ambient declarations for the Foundry VTT client globals this module
// touches. Foundry v14 does not yet ship first-party TypeScript types, and the
// community types lag the bleeding edge, so we keep these intentionally loose
// (`any`) rather than depend on a typings package that may not match v14. Swap
// in `@league-of-foundry-developers/foundry-vtt-types` later if desired.

/* eslint-disable @typescript-eslint/no-explicit-any */
declare const game: any;
declare const ui: any;
declare const Hooks: any;
declare const foundry: any;
declare const CONST: any;
declare const JournalEntry: any;
declare const Folder: any;
declare const Dialog: any;
declare const fetch: typeof globalThis.fetch;

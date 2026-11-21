/**
 * Application entry point (ES module, bundled by Vite).
 *
 * The legacy app (formerly the inline <script> in index.html) now lives in
 * src/legacy/app.js and uses the typed modules in src/config/ and src/domain/.
 * Remaining phases move the rest of it out, module by module:
 *   Phase 3 → services/, storage/   Phase 4 → state/   Phase 5 → ui/, i18n/
 * See claude/refactor-plan.md in the Gasolineras project.
 */
import './legacy/app.js';

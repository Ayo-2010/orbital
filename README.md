# Orbital — Flight Dynamics Drafting Desk

A mission-planning worksheet dressed as a 1960s flight-dynamics drafting sheet. Pale grid paper, cobalt technical ink, orange-red annotations and a stamped approval block frame a working circular-orbit planner.

## What it does

- Draws an SVG orbital plane around Earth that grows with altitude and rotates with inclination, with an animated satellite and trail.
- Computes orbital period, velocity, semi-major axis, orbits per day and maximum footprint from the selected altitude.
- Live altitude and inclination sliders revise the selected track.
- Launch-window countdown with a 14-minute window, UTC start and close times, GO state and a re-sync control.
- Tracks multiple satellites: add a designation, altitude and inclination; select a row to load it; remove objects from the file.
- Generates a six-contact pass schedule with AOS, LOS, maximum elevation, duration and date.
- Saves tracked objects, the current selection and the unfiled draft in `localStorage`.
- Keyboard-friendly form controls, visible focus states and a polite live region for status announcements.
- Responsive single-sheet layout down to 390 px, with reduced-motion handling for the orbit animation.

The orbit maths uses a circular two-body model with Earth radius 6371 km and μ = 398 600.4418 km³/s². Pass times are illustrative contact planning figures derived from the current solution, not a real ephemeris.

## Files

- `index.html` — sheet structure, SVG drafting diagram, controls and tables
- `styles.css` — drafting-paper styling, grid, stamps, responsive layout
- `app.js` — orbit calculations, SVG updates, storage, countdown, forms
- `README.md` — this document

## Run it

There is no build step and nothing to install. Open `index.html` directly in a browser, or serve the folder with any static file server. Fonts (Archivo and Space Mono) load from Google Fonts; all artwork is CSS or inline SVG.

Live demo: https://ayo-2010.github.io/orbital/

#!/usr/bin/env node
// One-off: trace the Ohmsie.webp mark to SVG paths so we can animate them.
// Run from /tmp/tracer:  node /path/to/this/script
import { Jimp } from 'jimp';
import ImageTracer from 'imagetracerjs';
import { writeFile } from 'node:fs/promises';

const SRC = '/tmp/tracer/ohmsi.png';   // PNG version produced via ImageMagick
const OUT = '/sessions/affectionate-inspiring-fermi/mnt/outputs/retrotype/public/images/Ohmsie.svg';

console.log('Reading', SRC);
const img = await Jimp.read(SRC);

// Convert to a pure black-and-white bitmap so the tracer gives us
// clean outline paths rather than gradients.
img.greyscale().contrast(0.6).threshold({ max: 128 });

const { data, width, height } = img.bitmap;

const imageData = { data: Array.from(data), width, height };

// numberofcolors: 2 → pure 2-tone bitmap
// ltres / qtres → smoothing thresholds (smaller = more detail)
// pathomit → ignore tiny noise paths
const options = {
  numberofcolors: 2,
  colorquantcycles: 4,
  ltres: 1,
  qtres: 1,
  pathomit: 16,
  rightangleenhance: false,
  blurradius: 1,
  blurdelta: 20,
  strokewidth: 0,
  linefilter: true,
  scale: 1,
};

console.log('Tracing…');
const svgString = ImageTracer.imagedataToSVG(imageData, options);

await writeFile(OUT, svgString, 'utf8');
console.log('Wrote', OUT, `(${svgString.length} bytes)`);

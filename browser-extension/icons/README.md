# Murmur Extension Icons

## Icon Files

For Chrome Web Store and manifest validation, you need actual PNG icons.

The `icon.svg` file serves as the source design. You can generate PNGs at the required sizes using:

```bash
# Using ImageMagick
convert icon.svg -resize 16x16 icon16.png
convert icon.svg -resize 48x48 icon48.png
convert icon.svg -resize 128x128 icon128.png

# Or using Inkscape
inkscape -w 16 -h 16 icon.svg -o icon16.png
inkscape -w 48 -h 48 icon.svg -o icon48.png
inkscape -w 128 -h 128 icon.svg -o icon128.png
```

## Current Placeholder

For now, create minimal placeholder PNGs with:

```bash
# 1x1 pixel blue placeholders (browsers will display these as solid color)
printf '\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x02\x00\x00\x00\x90wS\xde\x00\x00\x00\x0cIDATx\x9cc\xf8\x0f\x00\x00\x01\x01\x00\x05\x18\xd8N\x00\x00\x00\x00IEND\xaeB`\x82' > icon16.png
cp icon16.png icon48.png
cp icon16.png icon128.png
```

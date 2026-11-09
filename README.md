# Star Vault

Store any file as a night-sky SVG. Every byte of the file becomes one star. The SVG opens in any image viewer.

Live demo: https://stellar5055.github.io/star-vault/

## How it works

1. The file is read as bytes.
2. A small header is stuck on the front: `STAR` (4 bytes) + filename length (1 byte) + file length (4 bytes, big-endian) + filename + file bytes.
3. Each byte of that becomes one star: `<circle>` with `fill="rgb(255,255,BYTE)"`. The blue value is the data. Position and size are worked out from the star number, so they carry nothing.
4. To get the file back, read the blue values in order, check for `STAR`, split off the header, write the file.
5. SHA-256 of the original and the recovered file must match.

## Capacity

1 byte per star. Each star is about 78 bytes of SVG, so a 1 KB file makes roughly an 80 KB SVG. Keep inputs under ~20 KB for the demo, browsers get slow past ~20,000 stars.

## Try it

No install. Open the demo page:

- **Store:** drop any file in, click Make night sky, download the SVG. Note the SHA-256.
- **Retrieve:** drop the SVG back in (or paste it), compare the SHA, download your file.

To run locally, just open `index.html`. No build, no dependencies.

## Proof it round-trips

Tested with real files from my Downloads folder, through the app's own encode/decode code:

```
original:  channels4_profile.jpg  6,678 B   sha256 cf0ba5ae…2af65
recovered: channels4_profile.jpg  6,678 B   sha256 cf0ba5ae…2af65  identical

original:  07.png  87,852 B   sha256 9f231b52…7a76d
recovered: 07.png  87,852 B   sha256 9f231b52…7a76d  identical
```

Biggest file stored so far: `IMG_20260828_163356.jpg`, 1,247,338 B → 1,247,370 stars → ~69 MB SVG, round-tripped in ~3 seconds with matching SHA-256 (`b8fd4e7d…9bd9a8bbdfb`).

## Files

- `index.html` — the whole app. Vanilla JS, zero dependencies.
- `example.sky.svg` — a carrier with channels4_profile.jpg already in it, decode it to check

## Notes

- Filenames get cleaned up on decode (`../../x` becomes `x`, weird characters become `_`). The file contents are exact, the name might not be.
- Don't re-save the SVG as JPEG. JPEG nudges every pixel and kills the data.
- `crypto.subtle` needs https, so on `file://` the hash may show as unavailable. Encoding still works.

## What this isn't

Not base64 in a `.txt`, not a renamed PNG, not a zip glued onto a JPEG. The SVG is a real image and the data lives in the star colours.

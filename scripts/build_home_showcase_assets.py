"""Crop only user-supplied, approved UI regions. Never copy private originals.
Run with the bundled Python/Pillow. Output images are flattened and metadata-free.
"""
from pathlib import Path
from PIL import Image

root = Path(__file__).resolve().parents[1]
temp = Path('C:/Users/PC/AppData/Local/Temp')
out = root / 'assets/home-showcase'
out.mkdir(parents=True, exist_ok=True)
# Normalized crop coordinates refer to the supplied full-resolution screenshots.
# The student home crop excludes the greeting, teacher names and online-room panel.
items = [
 ('542a6b14-7d4a-47d6-8882-6266c492edc2', 'latex-editor', (.146,.135,.978,.940)),
 ('382198a1-3220-4d54-8c75-9a2f50a3051a', 'latex-geometry', (.592,.362,.927,.944)),
 ('84ef32f8-1244-481e-9a7b-8c07d41f98b4', 'latex-combinatorics', (.596,.16,.932,.603)),
 ('84ef32f8-1244-481e-9a7b-8c07d41f98b4', 'latex-polygon', (.596,.615,.932,.941)),
 ('aff3ce3f-de9f-49d9-9ddf-ce1956ebf734', 'question-bank', (.102,.172,.972,.797)),
 ('8632a52b-552b-4af7-a5d0-d71f9d9d8180', 'student-today', (.198,.170,.574,.851)),
 ('e6466757-21b0-40ad-8bbe-d1768f840432', 'student-journey', (.178,.422,.960,1)),
]
for ident, name, box in items:
    with Image.open(temp / ('codex-clipboard-'+ident+'.png')) as src:
        crop = src.convert('RGB').crop(tuple(round(v*s) for v,s in zip(box,src.size*2)))
        # Keep original screenshot pixels; no thumbnail downsampling before zoom.
        crop.save(out / (name+'.webp'),'WEBP',lossless=True,method=6)
        print(name, crop.size, (out/(name+'.webp')).stat().st_size)

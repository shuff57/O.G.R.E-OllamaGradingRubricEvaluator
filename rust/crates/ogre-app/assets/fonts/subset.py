"""Builds the fonts the app embeds from the full files in original/.

    python3 subset.py        (needs fontTools: pip install fonttools)

The text faces are cut to the scripts a grading page plausibly holds and
renamed, because the SIL Open Font License reserves the name "Source" for
unmodified fonts. The icon font is cut to the icons the app draws; anything
else falls back to egui's own fonts.
"""
import os
import subprocess

from fontTools.ttLib import TTFont

HERE = os.path.dirname(os.path.abspath(__file__))

# Latin with accents, Greek, punctuation, super- and subscripts, currency,
# letterlike symbols, fractions, arrows, mathematical operators, shapes.
TEXT = (
    "U+0020-007E,U+00A0-024F,U+02B0-02FF,U+0300-036F,U+0370-03FF,U+2000-206F,"
    "U+2070-209F,U+20A0-20BF,U+2100-214F,U+2150-218F,U+2190-21FF,U+2200-22FF,"
    "U+2300-23FF,U+25A0-25FF,U+2600-26FF,U+FB00-FB06"
)
# The icons named in src/theme.rs.
ICONS = "U+E742,U+E762,U+E28E,U+E270,U+E472,U+E330,U+E4E0,U+E184"

FACES = [
    ("SourceSans3-Regular.ttf", "OgreSans-Regular.ttf", "OGRE Sans", "Regular"),
    ("SourceSans3-Semibold.ttf", "OgreSans-Semibold.ttf", "OGRE Sans", "Semibold"),
    ("SourceSans3-Bold.ttf", "OgreSans-Bold.ttf", "OGRE Sans", "Bold"),
    ("SourceSerif4-Regular.ttf", "OgreSerif-Regular.ttf", "OGRE Serif", "Regular"),
]


def subset(source, target, unicodes):
    subprocess.run(
        [
            "pyftsubset",
            os.path.join(HERE, "original", source),
            f"--unicodes={unicodes}",
            "--layout-features=*",
            f"--output-file={target}",
        ],
        check=True,
    )


for source, target, family, style in FACES:
    path = os.path.join(HERE, target)
    subset(source, path, TEXT)
    font = TTFont(path)
    postscript = target.removesuffix(".ttf")
    names = {
        1: family if style in ("Regular", "Bold") else f"{family} {style}",
        3: f"{postscript};OGRE",
        4: f"{family} {style}",
        6: postscript,
        16: family,
        17: style,
    }
    table = font["name"]
    for record in list(table.names):
        if record.nameID in names:
            table.setName(
                names[record.nameID],
                record.nameID,
                record.platformID,
                record.platEncID,
                record.langID,
            )
        elif record.nameID in (18, 20, 21, 25):
            table.removeNames(nameID=record.nameID)
    font.save(path)
    # Copyright, licence and designer credits (0, 7, 13, 14) keep the original
    # name; nothing that names the font itself may.
    left = [
        record.toUnicode()
        for record in TTFont(path)["name"].names
        if record.nameID not in (0, 7, 13, 14) and "Source" in record.toUnicode()
    ]
    assert not left, left
    print(f"{target}: {os.path.getsize(path) // 1024} KB")

icons = os.path.join(HERE, "OgreIcons.ttf")
subset("Phosphor-Regular.ttf", icons, ICONS)
print(f"OgreIcons.ttf: {os.path.getsize(icons) // 1024} KB")

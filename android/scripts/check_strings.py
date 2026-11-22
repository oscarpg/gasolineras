#!/usr/bin/env python3
"""Checks the app's string resources: well-formed XML, unescaped apostrophes, and the same keys in
Spanish (values/) and English (values-en/). Fast feedback before the Android build."""
import re
import sys
import xml.dom.minidom

RES = "android/app/src/main/res"
FILES = {"es": f"{RES}/values/strings.xml", "en": f"{RES}/values-en/strings.xml"}
NOT_TRANSLATED = {"app_name"}

errors = []
keys = {}
for lang, path in FILES.items():
    text = open(path, encoding="utf-8").read()
    try:
        xml.dom.minidom.parseString(text)
    except Exception as e:  # noqa: BLE001
        errors.append(f"{path}: malformed XML: {e}")
        continue
    keys[lang] = set()
    for name, body in re.findall(r'<string name="([^"]+)"[^>]*>(.*?)</string>', text, re.S):
        keys[lang].add(name)
        if re.search(r"(?<!\\)'", body):
            errors.append(f"{path}: '{name}' has an unescaped apostrophe (write \\')")
if len(keys) == 2:
    for missing in sorted((keys["es"] - keys["en"]) - NOT_TRANSLATED):
        errors.append(f"values-en is missing '{missing}'")
    for missing in sorted(keys["en"] - keys["es"]):
        errors.append(f"values (Spanish) is missing '{missing}'")

for e in errors:
    print("::error::" + e)
print(f"{sum(len(k) for k in keys.values())} strings checked, {len(errors)} problems")
sys.exit(1 if errors else 0)

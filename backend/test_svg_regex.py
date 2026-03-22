import re

svg = '<svg width="3" height="3" viewBox="0 0 3 3" xmlns="http://www.w3.org/2000/svg"><circle cx="1.5" cy="1.5" r="1.5" fill="green"/></svg>'

widthMatch = re.search(r'width=["\']([\d.]+)', svg)
heightMatch = re.search(r'height=["\']([\d.]+)', svg)
viewBoxMatch = re.search(r'viewBox=["\'][\d.]+\s+[\d.]+\s+([\d.]+)\s+([\d.]+)', svg)

print(f"widthMatch: {widthMatch.group(1) if widthMatch else 'None'}")
print(f"heightMatch: {heightMatch.group(1) if heightMatch else 'None'}")
print(f"viewBoxMatch: {viewBoxMatch.groups() if viewBoxMatch else 'None'}")

# Fallback simulation
width = 24
height = 24

if widthMatch and heightMatch:
    width = float(widthMatch.group(1))
    height = float(heightMatch.group(1))
elif viewBoxMatch:
    width = float(viewBoxMatch.group(1))
    height = float(viewBoxMatch.group(2))

print(f"Result -> width: {width}, height: {height}")

import os
import json
import sqlite3
import math
from io import BytesIO
from typing import List, Dict, Any, Tuple
from PIL import Image
from svglib.svglib import svg2rlg
from reportlab.graphics import renderPM
import xml.etree.ElementTree as ET

from src.shared.dependencies import ADMIN_SQLITE_PATH

# Linux/Docker font registration for ReportLab
if os.name != 'nt':
    try:
        from reportlab.pdfbase import pdfmetrics
        from reportlab.pdfbase.ttfonts import TTFont
        font_dir = "/usr/share/fonts/truetype/liberation"
        if os.path.exists(font_dir):
            pdfmetrics.registerFont(TTFont('Arial', os.path.join(font_dir, 'LiberationSans-Regular.ttf')))
            pdfmetrics.registerFont(TTFont('Helvetica', os.path.join(font_dir, 'LiberationSans-Regular.ttf')))
            pdfmetrics.registerFont(TTFont('Arial-Bold', os.path.join(font_dir, 'LiberationSans-Bold.ttf')))
            print("Registered Liberation fonts as Arial/Helvetica fallbacks for Linux.")
    except Exception as e:
        print(f"Warning: Could not register Liberation fonts: {e}")

# Standard SVGs from GridMap.tsx frontend
DEFAULT_SVGS = {
    "open_switch": '<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"><line x1="30" y1="10" x2="30" y2="90" stroke="currentColor" stroke-width="8" stroke-linecap="round" /><line x1="70" y1="10" x2="70" y2="90" stroke="currentColor" stroke-width="8" stroke-linecap="round" /></svg>',
    "closed_switch": '<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"><line x1="30" y1="10" x2="30" y2="90" stroke="currentColor" stroke-width="8" stroke-linecap="round" /><line x1="70" y1="10" x2="70" y2="90" stroke="currentColor" stroke-width="8" stroke-linecap="round" /><line x1="15" y1="65" x2="85" y2="35" stroke="currentColor" stroke-width="8" stroke-linecap="round" /></svg>',
    "transformer": '<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"><polygon points="50,15 15,85 85,85" stroke="currentColor" fill="none" stroke-width="8" stroke-linejoin="round" /></svg>',
    "capacitor": '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2" fill="none"/><text x="50%" y="54%" dominant-baseline="middle" text-anchor="middle" fill="currentColor" font-family="Arial, sans-serif" font-weight="bold" font-size="12">C</text></svg>'
}

class SpriteGenerator:
    def __init__(self, item_size: int = 128):
        self.item_size = item_size

    def _process_svg(self, svg_str: str, color: str = None, css: str = None) -> str:
        """Inject color and CSS into SVG string."""
        if not svg_str:
            return ""

        # Normalize SVG if it's just content or needs viewBox
        if not svg_str.startswith("<svg"):
            svg_str = f'<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">{svg_str}</svg>'

        # Inject CSS
        if css and css.strip() and css.strip() not in ('[]', '{}'):
            style_block = f'<style>{css}</style>'
            if "</svg>" in svg_str:
                svg_str = svg_str.replace("</svg>", f"{style_block}</svg>")
            else:
                svg_str = f"{svg_str}{style_block}"

        if color:
            # Replace currentColor
            svg_str = svg_str.replace("currentColor", color)
            
            # Simple attribute injection (Pillow/svglib doesn't support complex CSS selectors well)
            # We trust the user provided good SVGs or we use basic replacement
            if 'fill="' not in svg_str and 'stroke="' not in svg_str:
                 svg_str = svg_str.replace("<svg", f'<svg fill="{color}" stroke="{color}"')

        # Linux/Docker compatibility: Replace Arial with a built-in font ReportLab knows
        if "Arial" in svg_str:
            svg_str = svg_str.replace("Arial", "Helvetica")

        return svg_str

    def _render_svg_to_image(self, svg_str: str) -> Image.Image:
        """Render SVG string to a PIL Image."""
        try:
            # Handle empty or invalid SVG
            if not svg_str:
                return Image.new("RGBA", (self.item_size, self.item_size), (0, 0, 0, 0))

            drawing = svg2rlg(BytesIO(svg_str.encode("utf-8")))
            if drawing is None or drawing.width <= 0 or drawing.height <= 0:
                return Image.new("RGBA", (self.item_size, self.item_size), (255, 0, 0, 50))

            # 1. Render raw reportlab drawing into B and W backgrounds for Alpha extraction
            img_b = renderPM.drawToPIL(drawing, bg=0x000000)
            img_w = renderPM.drawToPIL(drawing, bg=0xFFFFFF)

            data_b = img_b.getdata()
            data_w = img_w.getdata()
            out_data = bytearray(img_b.width * img_b.height * 4)

            for i, ((rb, gb, bb), (rw, gw, bw)) in enumerate(zip(data_b, data_w)):
                # Averaged difference
                a_f = 255.0 - ((rw - rb) + (gw - gb) + (bw - bb)) / 3.0
                a = int(round(a_f))
                idx = i * 4
                if a <= 0:
                    out_data[idx:idx+4] = b'\x00\x00\x00\x00'
                else:
                    r = min(255, int(rb * 255.0 / a))
                    g = min(255, int(gb * 255.0 / a))
                    b = min(255, int(bb * 255.0 / a))
                    out_data[idx:idx+4] = bytes((r, g, b, a))

            parsed_img = Image.frombytes("RGBA", img_b.size, bytes(out_data))

            # 2. Scale and center using PIL to avoid ReportLab shifting bugs
            scale_x = self.item_size / parsed_img.width
            scale_y = self.item_size / parsed_img.height
            scale = min(scale_x, scale_y) * 0.9 # Leave padding

            new_w = max(1, int(parsed_img.width * scale))
            new_h = max(1, int(parsed_img.height * scale))
            
            # Resampling filter: LANCZOS is best for high quality downsizing/upsizing
            resized_img = parsed_img.resize((new_w, new_h), Image.Resampling.LANCZOS)

            # Center on final transparent canvas
            final_img = Image.new("RGBA", (self.item_size, self.item_size), (0, 0, 0, 0))
            offset_x = (self.item_size - new_w) // 2
            offset_y = (self.item_size - new_h) // 2
            final_img.paste(resized_img, (offset_x, offset_y), resized_img) # use itself as mask
            
            return final_img

        except Exception as e:
            if "cannot open resource" in str(e).lower() and "<text" in svg_str:
                print(f"Font rendering failed, retrying without text elements...")
                # Simple regex-less stripping of <text>...</text>
                # (A better way would be using ET, but for a fallback this is safe)
                import re
                svg_no_text = re.sub(r'<text.*?</text>', '', svg_str, flags=re.DOTALL)
                return self._render_svg_to_image(svg_no_text)

            import traceback
            print(f"Error rendering SVG: {e}")
            print(f"FAILED SVG CONTENT: {svg_str}")
            traceback.print_exc()
            # Return a red square on error
            return Image.new("RGBA", (self.item_size, self.item_size), (255, 0, 0, 100))

    def generate(self) -> Tuple[bytes, Dict[str, Any]]:
        """Generate sprite sheet and metadata."""
        items = []
        
        # 1. Add Defaults
        for key, svg in DEFAULT_SVGS.items():
            items.append({
                "id": f"default_{key}",
                "svg": self._process_svg(svg, color="white"),
                "name": f"Default {key}"
            })

        # 2. Add Rules from DB
        try:
            with sqlite3.connect(ADMIN_SQLITE_PATH) as conn:
                conn.row_factory = sqlite3.Row
                rules = conn.execute("SELECT * FROM display_config_rules WHERE enabled = 1").fetchall()
                for rule in rules:
                    d = dict(rule)
                    try:
                        config = json.loads(d['config']) if d.get('config') else {}
                    except:
                        config = {}
                    
                    icon_svg = config.get('icon')
                    if not icon_svg:
                        continue
                        
                    css_str = ""
                    overrides = config.get('css_overrides')
                    if overrides and isinstance(overrides, list):
                        css_str = "\n".join(o.get('css', '') for o in overrides if isinstance(o, dict))

                    items.append({
                        "id": f"rule_{d['id']}",
                        "svg": self._process_svg(icon_svg, color=config.get('color_hex'), css=css_str),
                        "name": d['name']
                    })
        except Exception as e:
            print(f"Error fetching rules for sprite generation: {e}")

        if not items:
            # Return a tiny empty sprite sheet if nothing to render
            return b"", {}

        # 3. Pack into Sprite Sheet
        num_items = len(items)
        cols = math.ceil(math.sqrt(num_items))
        rows = math.ceil(num_items / cols)
        
        sprite_width = cols * self.item_size
        sprite_height = rows * self.item_size
        
        sprite_sheet = Image.new("RGBA", (sprite_width, sprite_height), (0, 0, 0, 0))
        mapping = {}

        for idx, item in enumerate(items):
            row = idx // cols
            col = idx % cols
            x = col * self.item_size
            y = row * self.item_size
            
            img = self._render_svg_to_image(item["svg"])
            sprite_sheet.paste(img, (x, y))
            
            mapping[item["id"]] = {
                "x": x,
                "y": y,
                "width": self.item_size,
                "height": self.item_size,
                "anchorX": self.item_size // 2,
                "anchorY": self.item_size // 2,
                "name": item["name"]
            }

        # 4. Save to Bytes
        output = BytesIO()
        sprite_sheet.save(output, format="PNG")
        return output.getvalue(), mapping

generator = SpriteGenerator()

import os
import json
import sqlite3
import math
import re
from io import BytesIO
from typing import List, Dict, Any, Tuple
from PIL import Image
from svglib.svglib import svg2rlg
from reportlab.graphics import renderPM
import xml.etree.ElementTree as ET
import hashlib
import itertools
import logging

from src.shared.dependencies import ADMIN_SQLITE_PATH

logger = logging.getLogger(__name__)

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

    def _process_svg(self, svg_str: str, color: str = None, overrides: List[Dict[str, Any]] = None) -> str:
        """Inject color and apply SVG/CSS overrides into SVG string."""
        if not svg_str:
            return ""

        import re
        
        def get_inner(content: str) -> str:
            """Extracts everything inside the root <svg> tags."""
            if not content or "<svg" not in content.lower():
                return content or ""
            # Find the first > after <svg
            start_tag_end = content.find(">") + 1
            # Find the last </svg>
            end_tag_start = content.rfind("</svg>")
            if start_tag_end > 0 and end_tag_start > start_tag_end:
                return content[start_tag_end:end_tag_start]
            return content

        # 1. Extract Base ViewBox and Content
        vb_match = re.search(r'viewBox=["\']([^"]*)["\']', svg_str)
        view_box = vb_match.group(1) if vb_match else "0 0 100 100"
        base_inner = get_inner(svg_str)

        # 2. Build the combined SVG
        # We force width/height/viewBox to ensure consistent 100x100 frame
        final_color = color or "#cccccc"
        # CRITICAL: We removed fill="{final_color}" from the root tag here to fix giant squares
        result = [f'<svg width="100" height="100" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">']
        
        # 3. Add Base Layer (scaled and CENTERED to fit 100x100 frame)
        try:
            parts = [float(x) for x in view_box.split()]
            if len(parts) == 4:
                vx, vy, vw, vh = parts
                scale = min(100.0 / vw, 100.0 / vh)
                # Calculate centering offsets
                off_x = (100.0 - (vw * scale)) / 2.0
                off_y = (100.0 - (vh * scale)) / 2.0
                
                # Full transform stack: move to center, scale, then move to original origin
                transform = f'transform="translate({off_x:.3f}, {off_y:.3f}) scale({scale:.3f}) translate({-vx:.3f}, {-vy:.3f})"'
                result.append(f'<g {transform}>{base_inner}</g>')
            else:
                result.append(f'<g>{base_inner}</g>')
        except:
            result.append(f'<g>{base_inner}</g>')

        # 4. Add Overlays (each wrapped in its own group)
        if overrides:
            for o in overrides:
                mode = o.get('mode', 'add')
                content = o.get('svg') or o.get('icon') or ''
                if not content:
                    continue
                
                ov_inner = get_inner(content)
                if mode == 'replace':
                    # Replacement mode wipes the base and previous overlays
                    result = [result[0], f'<g>{ov_inner}</g>']
                else:
                    result.append(f'<g>{ov_inner}</g>')

        result.append("</svg>")
        svg_str = "".join(result)

        # 5. Final color and font processing
        # Inject color only into explicit currentColor placeholders
        svg_str = re.sub(r'\bcurrentColor\b', final_color, svg_str, flags=re.IGNORECASE)

        if "Arial" in svg_str:
            svg_str = svg_str.replace("Arial", "Helvetica")

        return svg_str

    def _render_svg_to_image(self, svg_str: str) -> Image.Image:
        """Render SVG string to a PIL Image using a fixed 100x100 frame."""
        try:
            if not svg_str:
                return Image.new("RGBA", (self.item_size, self.item_size), (0, 0, 0, 0))

            drawing = svg2rlg(BytesIO(svg_str.encode("utf-8")))
            if drawing is None:
                return Image.new("RGBA", (self.item_size, self.item_size), (255, 0, 0, 50))

            # Force drawing dimensions to 100x100 to prevent content-based shifting
            drawing.width = 100
            drawing.height = 100

            img_b = renderPM.drawToPIL(drawing, bg=0x000000)
            img_w = renderPM.drawToPIL(drawing, bg=0xFFFFFF)

            data_b = img_b.getdata()
            data_w = img_w.getdata()
            out_data = bytearray(img_b.width * img_b.height * 4)

            for i, ((rb, gb, bb), (rw, gw, bw)) in enumerate(zip(data_b, data_w)):
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

            # Now scale the 100x100 result to the sprite size (128x128)
            scale = (self.item_size / 100.0) * 0.9 # Keep 10% padding
            new_w = int(100 * scale)
            new_h = int(100 * scale)
            
            resized_img = parsed_img.resize((new_w, new_h), Image.Resampling.LANCZOS)

            final_img = Image.new("RGBA", (self.item_size, self.item_size), (0, 0, 0, 0))
            offset_x = (self.item_size - new_w) // 2
            offset_y = (self.item_size - new_h) // 2
            final_img.paste(resized_img, (offset_x, offset_y), resized_img)
            
            return final_img

        except Exception as e:
            logger.error("Render failed: %s", e)
            return Image.new("RGBA", (self.item_size, self.item_size), (255, 0, 0, 100))

    def _calculate_override_hash(self, overrides: List[Dict[str, Any]]) -> str:
        if not overrides: return ""
        normalized = []
        for o in overrides:
            normalized.append(f"{o.get('svg','') or o.get('icon','')}|{o.get('mode','add')}")
        normalized.sort()
        combined_str = "||".join(normalized)
        hash_val = 5381
        for char in combined_str:
            hash_val = ((hash_val << 5) + hash_val) + ord(char)
        return hex(hash_val & 0xFFFFFFFF)[2:].zfill(8)

    def generate(self) -> Tuple[bytes, Dict[str, Any]]:
        """Generate sprite sheet and metadata."""
        items = []
        for key, svg in DEFAULT_SVGS.items():
            items.append({
                "id": f"default_{key}",
                "svg": self._process_svg(svg, color="white"),
                "name": f"Default {key}"
            })

        try:
            with sqlite3.connect(ADMIN_SQLITE_PATH) as conn:
                conn.row_factory = sqlite3.Row
                rules = conn.execute("SELECT * FROM display_config_rules WHERE enabled = 1").fetchall()
                for rule in rules:
                    d = dict(rule)
                    try: 
                        config = json.loads(d['config'])
                    except: 
                        continue
                    
                    icon_svg = config.get('icon') or config.get('svg')
                    if not icon_svg: continue
                    
                    color_hex = config.get('color_hex')
                    candidates = []
                    for o in (config.get('svg_overrides') or []):
                        ov_content = o.get('svg') or o.get('icon')
                        if ov_content:
                            candidates.append({
                                "svg": ov_content,
                                "mode": o.get('mode', 'add'),
                                "conditions": o.get('conditions', {})
                            })
                    for o in (config.get('css_overrides') or []):
                        if isinstance(o, dict) and o.get('css'):
                            candidates.append({
                                "svg": f"<style>{o.get('css')}</style>",
                                "mode": 'add',
                                "conditions": o.get('conditions', {})
                            })

                    unconditional = [c for c in candidates if not c.get('conditions')]
                    conditional = [c for c in candidates if c.get('conditions')]
                    
                    items.append({
                        "id": f"rule_{d['id']}",
                        "svg": self._process_svg(icon_svg, color=color_hex, overrides=unconditional),
                        "name": d['name']
                    })
                    
                    k = min(len(conditional), 4)
                    for i in range(1, k + 1):
                        for combo in itertools.combinations(conditional[:k], i):
                            active = unconditional + list(combo)
                            render_ready = [{"svg": o['svg'], "mode": o['mode']} for o in active]
                            ov_hash = self._calculate_override_hash(render_ready)
                            items.append({
                                "id": f"rule_{d['id']}_{ov_hash}",
                                "svg": self._process_svg(icon_svg, color=color_hex, overrides=render_ready),
                                "name": f"{d['name']} (Override {ov_hash})"
                            })
        except Exception as e:
            logger.error("Error generating sprites: %s", e)

        if not items: return b"", {}

        num_items = len(items)
        cols = math.ceil(math.sqrt(num_items))
        rows = math.ceil(num_items / cols)
        sprite_sheet = Image.new("RGBA", (cols * self.item_size, rows * self.item_size), (0, 0, 0, 0))
        mapping = {}

        for idx, item in enumerate(items):
            x, y = (idx % cols) * self.item_size, (idx // cols) * self.item_size
            img = self._render_svg_to_image(item["svg"])
            sprite_sheet.paste(img, (x, y))
            mapping[item["id"]] = {
                "x": x, "y": y, "width": self.item_size, "height": self.item_size,
                "anchorX": self.item_size // 2, "anchorY": self.item_size // 2,
                "name": item["name"]
            }

        output = BytesIO()
        sprite_sheet.save(output, format="PNG")
        return output.getvalue(), mapping

generator = SpriteGenerator()

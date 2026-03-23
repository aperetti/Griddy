import unittest
from unittest.mock import patch
from PIL import Image
import sqlite3
import tempfile
import json
import os
from src.grid.sprites import SpriteGenerator, DEFAULT_SVGS

class TestSpriteGenerator(unittest.TestCase):
    def setUp(self):
        self.generator = SpriteGenerator(item_size=128)

    def test_process_svg_empty(self):
        result = self.generator._process_svg(None)
        self.assertEqual(result, "")

    def test_process_svg_injects_color(self):
        svg_src = '<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"><circle cx="50" cy="50" r="40" fill="currentColor"/></svg>'
        res = self.generator._process_svg(svg_src, color="#FF0000")
        self.assertIn('fill="#FF0000"', res)

    def test_process_svg_injects_css(self):
        svg_src = '<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"><circle cx="50" cy="50" r="40" fill="white"/></svg>'
        css_str = ".custom { fill: blue; }"
        res = self.generator._process_svg(svg_src, css=css_str)
        self.assertIn('<style>.custom { fill: blue; }</style>', res)

    def test_render_svg_to_image_transparency_and_sizing(self):
        # A simple red square SVG
        svg_src = '<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"><rect width="100" height="100" fill="red"/></svg>'
        
        img = self.generator._render_svg_to_image(svg_src)
        
        # Should return a PIL Image
        self.assertIsInstance(img, Image.Image)
        
        # Dimensions MUST match exactly the configured item_size
        self.assertEqual(img.size, (128, 128))
        self.assertEqual(img.mode, "RGBA")
        
        # Ensure it has transparency outside of the bounds (bbox should not equal 0,0,128,128, but center padded)
        # Because we pad it with 0.9 scale, the actual colored content won't reach the edges.
        bbox = img.getbbox()
        self.assertIsNotNone(bbox) # Must have some content
        
        # Ensure it didn't fill the whole container, indicating the internal centering padding worked
        self.assertTrue(bbox[0] > 0)
        self.assertTrue(bbox[1] > 0)
        self.assertTrue(bbox[2] < 128)
        self.assertTrue(bbox[3] < 128)

    def test_render_svg_to_image_handles_xml_prologues(self):
        svg_with_xml = '<?xml version="1.0" encoding="utf-8"?><svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"><circle cx="50" cy="50" r="40" fill="blue"/></svg>'
        img = self.generator._render_svg_to_image(svg_with_xml)
        self.assertEqual(img.size, (128, 128))
        self.assertIsNotNone(img.getbbox())

    def test_generate_from_db(self):
        """Test full generation including drawing defaults and handling DB rules correctly without crasing."""
        # Create a mock database
        db_fd, db_path = tempfile.mkstemp()
        os.close(db_fd) # Close immediately, SQLite will open its own handlers
        try:
            conn = sqlite3.connect(db_path)
            cursor = conn.cursor()
            cursor.execute("CREATE TABLE display_config_rules (id INTEGER PRIMARY KEY, name TEXT, icon TEXT, color_hex TEXT, css_overrides TEXT, enabled INTEGER)")
            
            # Rule 1: A valid SVG
            cursor.execute("INSERT INTO display_config_rules (name, icon, color_hex, css_overrides, enabled) VALUES ('Test1', ?, '#0000FF', '[]', 1)", ('<svg viewBox="0 0 10 10"><circle cx="5" cy="5" r="4" fill="currentColor"/></svg>',))
            
            # Rule 2: An SVG with CSS
            css_payload = json.dumps([{"css": ".marker { stroke-width: 2; }"}])
            cursor.execute("INSERT INTO display_config_rules (name, icon, color_hex, css_overrides, enabled) VALUES ('Test2', ?, NULL, ?, 1)", ('<svg viewBox="0 0 10 10"><rect width="10" height="10" class="marker" fill="none"/></svg>', css_payload))
            
            # Rule 3: Disabled rule (should be skipped)
            cursor.execute("INSERT INTO display_config_rules (name, icon, color_hex, css_overrides, enabled) VALUES ('Test3', ?, NULL, NULL, 0)", ('<svg></svg>',))
            conn.commit()
            conn.close()

            # Mock ADMIN_SQLITE_PATH to point to our test DB
            with patch('src.grid.sprites.ADMIN_SQLITE_PATH', db_path):
                raw_bytes, mapping = self.generator.generate()
                
                # Should have produced valid bytes
                self.assertTrue(len(raw_bytes) > 0)
                
                # Mapping should contain defaults + 2 active rules
                self.assertIn('default_open_switch', mapping)
                self.assertIn('rule_1', mapping)
                self.assertIn('rule_2', mapping)
                self.assertNotIn('rule_3', mapping)
        finally:
            try:
                os.unlink(db_path)
            except OSError:
                pass

if __name__ == '__main__':
    unittest.main()

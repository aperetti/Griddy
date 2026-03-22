import requests
import json

def test_save_rule():
    BASE_URL = "http://localhost:8090/api/display-rules" # Admin backend
    
    # 1. Get configs to find a valid config_id
    try:
        resp = requests.get(f"{BASE_URL}/configs")
        print(f"GET /configs Status: {resp.status_code}")
        print(f"GET /configs Text: {resp.text}")
        configs = resp.json()
        if not isinstance(configs, list) or not configs:
            print("No valid configs list found")
            return
        config_id = configs[0]['id']
        print(f"Using config_id: {config_id}")
        
        # 2. Add a new rule with match_conditions and color_hex
        new_rule = {
            "name": "Test Save Rule",
            "visual_type": "TestType",
            "priority": 99,
            "match_conditions": json.dumps({
                "target_class": "ACLineSegment",
                "conditions": [{"path": "r", "op": ">", "value": 0.5}]
            }),
            "color_hex": "#123456",
            "icon": "mdi:test"
        }
        
        post_resp = requests.post(f"{BASE_URL}/configs/{config_id}/rules", json=new_rule)
        print(f"POST Status: {post_resp.status_code}")
        if post_resp.status_code == 201:
            rule_id = post_resp.json()['id']
            print(f"Rule created with ID: {rule_id}")
            
            # 3. Retrieve rules and check if match_conditions and color_hex are present
            get_resp = requests.get(f"{BASE_URL}/configs/{config_id}/rules")
            rules = get_resp.json()
            saved_rule = next((r for r in rules if r['id'] == rule_id), None)
            
            if saved_rule:
                print("Success: Rule retrieved")
                print(f"Saved match_conditions: {saved_rule.get('match_conditions')}")
                print(f"Saved color_hex: {saved_rule.get('color_hex')}")
                
                if saved_rule.get('match_conditions') == new_rule['match_conditions'] and saved_rule.get('color_hex') == new_rule['color_hex']:
                    print("E2E Verification SUCCESS")
                else:
                    print("Verification FAILED: Data mismatch")
            else:
                print("Verification FAILED: Rule not found in list")
        else:
            print(f"POST Failed: {post_resp.text}")
            
    except Exception as e:
        import traceback
        print(f"Error type: {type(e)}")
        print(f"Error message: {e}")
        traceback.print_exc()

if __name__ == "__main__":
    test_save_rule()

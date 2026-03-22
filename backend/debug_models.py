from src.shared.dependencies import registry
import os

print(f"Registry type: {type(registry)}")
print(f"Models: {registry.list_models()}")

# Try explicit discovery
print("Running explicit discovery...")
registry.discover()
print(f"Models after discovery: {registry.list_models()}")

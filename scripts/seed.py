import json
import requests
import sys

GATEWAY_URL = "http://localhost:3001/api/seed"

def seed():
    try:
        with open("data/fixtures/media.json", "r") as f:
            outlets = json.load(f)
        
        with open("data/fixtures/profiles.json", "r") as f:
            profiles = json.load(f)

        # Register media outlets
        for outlet in outlets:
            r = requests.post(f"{GATEWAY_URL}/media", json=outlet)
            print(f"Seeded outlet {outlet['id']}: {r.status_code}")

        # Bind profile
        for did, profile in profiles.items():
            r = requests.post(f"{GATEWAY_URL}/profile", json={"did": did, "profile": profile})
            print(f"Seeded profile {did}: {r.status_code}")
            
        print("Seeding completed successfully.")
    except Exception as e:
        print(f"Seeding failed: {e}")
        sys.exit(1)

if __name__ == "__main__":
    seed()

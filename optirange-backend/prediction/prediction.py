import sys
import json
import math
def calculate_range(battery, efficiency=5):
    return battery * efficiency
def calculate_stops(distance, range_km):
    if range_km == 0:
        return 0
    return max(0, math.ceil(distance / range_km) - 1)
def health_check(fatigue, sleep):
    if sleep < 5:
        return "⚠️ Low sleep. Take frequent breaks."
    elif fatigue == "high":
        return "🚨 High fatigue. Avoid long driving."
    else:
        return "✅ You are fit to drive."
def predict(data):
    battery = data["battery"]
    distance = data["distance"]
    fatigue = data["fatigue"]
    sleep = data["sleep"]
    range_km = calculate_range(battery)
    result = {}
    if range_km >= distance:
        result["status"] = "Reachable"
        result["charging_required"] = False
        result["stops"] = 0
    else:
        result["status"] = "Charging Needed"
        result["charging_required"] = True
        result["stops"] = calculate_stops(distance, range_km)
    result["estimated_range"] = range_km
    result["health_advice"] = health_check(fatigue, sleep)
    return result
if __name__ == "__main__":
    input_data = json.loads(sys.argv[1])
    output = predict(input_data)
    print(json.dumps(output))
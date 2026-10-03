/** Convenience choices only. A city name or phone location never selects a zone automatically. */
export function TimeZoneChoices() {
  return <datalist id="mira-time-zones">{[
    ["Asia/Kolkata", "India"], ["Europe/London", "United Kingdom"], ["Europe/Paris", "Central Europe"],
    ["Europe/Berlin", "Berlin"], ["America/New_York", "New York"], ["America/Chicago", "Chicago"],
    ["America/Los_Angeles", "Los Angeles"], ["America/Toronto", "Toronto"], ["America/Sao_Paulo", "São Paulo"],
    ["Asia/Dubai", "Dubai"], ["Asia/Singapore", "Singapore"], ["Asia/Bangkok", "Bangkok"], ["Asia/Tokyo", "Japan"],
    ["Asia/Seoul", "South Korea"], ["Australia/Sydney", "Sydney"], ["Australia/Perth", "Perth"],
    ["Pacific/Auckland", "New Zealand"], ["Africa/Johannesburg", "South Africa"], ["Africa/Nairobi", "Kenya"], ["UTC", "UTC"],
  ].map(([value, label]) => <option key={value} value={value}>{label}</option>)}</datalist>;
}

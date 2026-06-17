// Inisialisasi Map
export function initMap(elementId, centerLat, centerLng, zoom = 15) {
    const mapElement = document.getElementById(elementId)
    if (!mapElement) return null
    
    try {
        const map = L.map(elementId).setView([centerLat, centerLng], zoom)
        
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap'
        }).addTo(map)
        
        return map
    } catch (error) {
        console.error("Error init map:", error)
        return null
    }
}

// Tambah marker
export function addMarker(map, lat, lng, title, type = 'user') {
    if (!map) return null
    
    let icon
    
    if (type === 'kantor') {
        icon = L.divIcon({
            html: '<div style="background:#EE2737; width:20px; height:20px; border-radius:50%; border:2px solid white;"></div>',
            className: 'custom-marker',
            iconSize: [20, 20]
        })
    } else if (type === 'kelurahan') {
        icon = L.divIcon({
            html: '<div style="background:#3498DB; width:20px; height:20px; border-radius:50%; border:2px solid white;"></div>',
            className: 'custom-marker',
            iconSize: [20, 20]
        })
    } else {
        icon = L.divIcon({
            html: '<div style="background:#27AE60; width:15px; height:15px; border-radius:50%; border:2px solid white;"></div>',
            className: 'custom-marker',
            iconSize: [15, 15]
        })
    }
    
    const marker = L.marker([lat, lng], { icon }).addTo(map)
    if (title) marker.bindPopup(title)
    
    return marker
}

// Hitung jarak (meter)
export function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371e3
    const φ1 = lat1 * Math.PI / 180
    const φ2 = lat2 * Math.PI / 180
    const Δφ = (lat2 - lat1) * Math.PI / 180
    const Δλ = (lon2 - lon1) * Math.PI / 180
    
    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ / 2) * Math.sin(Δλ / 2)
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
    
    return Math.round(R * c)
}

// Gambar radius
export function drawRadius(map, lat, lng, radius = 100, color = '#EE2737') {
    if (!map) return
    
    return L.circle([lat, lng], {
        color: color,
        fillColor: color,
        fillOpacity: 0.1,
        radius: radius
    }).addTo(map)
}
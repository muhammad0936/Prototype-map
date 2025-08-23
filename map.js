localStorage.setItem('theme', 'light');
if (!localStorage.getItem('userProfile')) {
  localStorage.setItem(
    'userProfile',
    JSON.stringify({
      name: 'أحمد أحمد',
      email: 'ahmed@example.com',
      car: 'Toyota Corolla',
      img: './avatar.jpg',
    })
  );
}
const map = L.map('map').setView([24.7136, 46.6753], 12); // Riyadh center

// Base layers: street and satellite
const streetLayer = L.tileLayer(
  'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
  {
    attribution: '© OpenStreetMap contributors',
  }
).addTo(map);

const satelliteLayer = L.tileLayer(
  'https://{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}',
  {
    subdomains: ['mt0', 'mt1', 'mt2', 'mt3'],
    attribution: '© Google',
    maxZoom: 20,
  }
);

let isSatellite = false;
let currentLocationMarker = null;
let watchId = null;

let points = [];
let routeLayers = [];
let markers = [];

// Get current location function
function getCurrentLocation() {
  if (!navigator.geolocation) {
    alert('متصفحك لا يدعم خدمة تحديد الموقع');
    return;
  }

  // Show loading indicator
  const locationBtns = document.querySelectorAll('[id*="location"]');
  locationBtns.forEach((btn) => {
    const originalHtml = btn.innerHTML;
    btn.innerHTML = btn.innerHTML.replace(/📍|⏳/g, '⏳');
    setTimeout(() => {
      btn.innerHTML = originalHtml;
    }, 5000);
  });

  navigator.geolocation.getCurrentPosition(
    (position) => {
      const { latitude, longitude } = position.coords;
      const accuracy = position.coords.accuracy;

      // Remove any existing current location marker
      if (currentLocationMarker) {
        map.removeLayer(currentLocationMarker);
      }

      // Add new marker for current location
      currentLocationMarker = L.marker([latitude, longitude])
        .addTo(map)
        .bindPopup('موقعك الحالي')
        .openPopup();

      // If we don't have a start point, set it as start
      if (points.length === 0) {
        points.push({ lat: latitude, lng: longitude });
        markers.push(currentLocationMarker);
        alert(
          'تم تعيين موقعك الحالي كنقطة البداية. اختر نقطة النهاية على الخريطة.'
        );
      } else if (points.length === 1) {
        // If we already have start point, set as end point
        points.push({ lat: latitude, lng: longitude });
        markers.push(currentLocationMarker);
        getRoutes(points[0], points[1]);
      } else {
        // If we have both points, replace end point
        const endMarker = markers.pop();
        if (endMarker && endMarker !== currentLocationMarker) {
          map.removeLayer(endMarker);
        }
        points[1] = { lat: latitude, lng: longitude };
        markers.push(currentLocationMarker);
        routeLayers.forEach((layer) => map.removeLayer(layer));
        routeLayers = [];
        getRoutes(points[0], points[1]);
      }

      // Pan to current location
      map.setView([latitude, longitude], 16);
    },
    (error) => {
      alert('تعذر الحصول على الموقع: ' + error.message);
    },
    {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 60000,
    }
  );
}

map.on('click', (e) => {
  if (points.length === 0) {
    const marker = L.marker(e.latlng).addTo(map).bindPopup('بداية').openPopup();
    markers.push(marker);
    points.push(e.latlng);
    return;
  }

  if (points.length === 1) {
    const marker = L.marker(e.latlng).addTo(map).bindPopup('نهاية').openPopup();
    markers.push(marker);
    points.push(e.latlng);
    getRoutes(points[0], points[1]);
    return;
  }

  // If already have start and end: replace only the end point
  if (points.length === 2) {
    // Remove existing end marker
    const endMarker = markers.pop();
    if (endMarker) map.removeLayer(endMarker);

    // Add new end marker and update points[1]
    const newEndMarker = L.marker(e.latlng)
      .addTo(map)
      .bindPopup('نهاية')
      .openPopup();
    markers.push(newEndMarker);
    points[1] = e.latlng;

    // Clear previous routes and fetch again
    routeLayers.forEach((layer) => map.removeLayer(layer));
    routeLayers = [];
    getRoutes(points[0], points[1]);
  }
});

async function getRoutes(start, end) {
  // Remove old routes
  routeLayers.forEach((layer) => map.removeLayer(layer));
  routeLayers = [];

  const baseUrl = 'https://router.project-osrm.org/route/v1/driving/';
  const coords = `${start.lng},${start.lat};${end.lng},${end.lat}`;
  const params = '?overview=full&geometries=geojson&alternatives=3';

  try {
    // Try multiple strategies to obtain up to three distinct routes
    const requests = [
      fetch(baseUrl + coords + params),
      fetch(baseUrl + coords + params + '&exclude=motorway'),
    ];

    const responses = await Promise.allSettled(requests);

    let allRoutes = [];
    for (const result of responses) {
      if (result.status === 'fulfilled') {
        const res = result.value;
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data.routes)) {
            allRoutes = allRoutes.concat(data.routes);
          }
        }
      }
    }

    const uniqueSortedRoutes = dedupeAndSortRoutes(allRoutes).slice(0, 3);

    if (uniqueSortedRoutes.length === 0) {
      throw new Error('لم يتم العثور على مسارات');
    }

    displayRoutes(uniqueSortedRoutes);
  } catch (err) {
    console.error(err);
    document.getElementById(
      'route-info'
    ).innerHTML = `<p style="color:red;">حدث خطأ: ${err.message}</p>`;
    document.getElementById(
      'mobile-route-info'
    ).innerHTML = `<p style="color:red;">حدث خطأ: ${err.message}</p>`;
  }
}

function dedupeAndSortRoutes(routes) {
  const seen = new Set();
  const unique = [];

  for (const route of routes) {
    const distKmRounded = Math.round((route.distance || 0) / 1000);
    const timeMinRounded = Math.round((route.duration || 0) / 60);
    const key = `${distKmRounded}-${timeMinRounded}`;

    if (!seen.has(key)) {
      seen.add(key);
      unique.push(route);
    }
  }

  unique.sort((a, b) => (a.duration || 0) - (b.duration || 0));
  return unique;
}

function displayRoutes(routes) {
  const colors = [
    'var(--route-blue)',
    'var(--route-green)',
    'var(--route-red)',
  ];
  const infoDiv = document.getElementById('route-info');
  const mobileInfoDiv = document.getElementById('mobile-route-info');

  infoDiv.innerHTML = '';
  mobileInfoDiv.innerHTML = '';

  routes.slice(0, 3).forEach((route, idx) => {
    const layer = L.geoJSON(route.geometry, {
      style: {
        color: colors[idx % colors.length],
        weight: 4,
        opacity: 0.8,
      },
    }).addTo(map);
    routeLayers.push(layer);

    const distKm = (route.distance / 1000).toFixed(2);
    const timeMin = Math.round(route.duration / 60);

    const routeHtml = `
        <div class="route">
          <b>${idx === 0 ? 'أسرع مسار' : `بديل ${idx}`}</b><br>
          الزمن: ${timeMin} دقيقة<br>
          المسافة: ${distKm} كم<br>
          السرعة الوسطية: ${parseInt((distKm / timeMin) * 60)} كم/ساعة
        </div>
      `;

    infoDiv.innerHTML += routeHtml;
    mobileInfoDiv.innerHTML += routeHtml;
  });

  const group = L.featureGroup(routeLayers);
  map.fitBounds(group.getBounds(), { padding: [20, 20] });
}

function clearSelection() {
  markers.forEach((m) => map.removeLayer(m));
  markers = [];

  routeLayers.forEach((layer) => map.removeLayer(layer));
  routeLayers = [];

  points = [];

  // Don't remove current location marker
  if (currentLocationMarker) {
    map.removeLayer(currentLocationMarker);
    currentLocationMarker = null;
  }

  const infoDiv = document.getElementById('route-info');
  const mobileInfoDiv = document.getElementById('mobile-route-info');

  if (infoDiv) {
    infoDiv.innerHTML = 'اختر نقطتين على الخريطة لعرض المسارات.';
  }

  if (mobileInfoDiv) {
    mobileInfoDiv.innerHTML = 'اختر نقطتين على الخريطة لعرض المسارات.';
  }
}

// Event listeners
const clearBtn = document.getElementById('clear-btn');
if (clearBtn) {
  clearBtn.addEventListener('click', clearSelection);
}

const mobileClearBtn = document.getElementById('mobile-clear-btn');
if (mobileClearBtn) {
  mobileClearBtn.addEventListener('click', clearSelection);
}

const basemapToggleBtn = document.getElementById('basemap-toggle-btn');
if (basemapToggleBtn) {
  basemapToggleBtn.addEventListener('click', toggleBasemap);
}

const mobileBasemapBtn = document.getElementById('mobile-basemap-btn');
if (mobileBasemapBtn) {
  mobileBasemapBtn.addEventListener('click', toggleBasemap);
}

function toggleBasemap() {
  if (isSatellite) {
    map.removeLayer(satelliteLayer);
    streetLayer.addTo(map);
    basemapToggleBtn.innerHTML = `<span>          <svg
            width="20px"
            height="20px"
            viewBox="0 0 512 512"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              fill="#aaa"
              d="M314.125 45.125l-36.28 10.97 26.717 38.874L340.844 84l-26.72-38.875zM260.47 61.313l-43 13 26.686 38.874 41.625-12.562-26.467-38.5 1.156-.813zm91.467 38.874l-36.28 10.938 27.374 39.813L379.314 140l-27.375-39.813zM120.47 107.78l-36.282 10.94 26.718 38.905 36.28-10.97-26.717-38.874zm176.405 9.032l-41.594 12.563 12.814 18.656c13.59 1.764 26.138 6.878 36.844 14.44l19.312-5.845-27.375-39.813zm-230.03 7.157l-43 12.968 26.718 38.906 41.562-12.563-26.47-38.5 1.19-.81zm323.56 32.155l-36.28 10.97 25.97 37.81 36.28-10.936-25.97-37.845zm-232.092 6.72L122 173.78l27.375 39.814 36.28-10.938-27.343-39.812zm99.125 3.186c-22.736 0-42.626 11.753-53.97 29.532l66.782 97.188c6.682-1.346 12.98-3.725 18.72-6.97l7.874 11.69 15.78-10.033-8.874-13.187c10.95-11.475 17.656-27.028 17.656-44.22 0-35.446-28.52-64-63.97-64zm77.906 6.75l-14.438 4.345c9.396 11.262 15.84 25.07 18.188 40.188l22.22-6.72-25.97-37.812zm-232.125 6.69L61.655 192l27.313 39.813 41.593-12.563-27.344-39.78zm324.28 30.655l-36.28 10.97 27.342 39.81 36.313-10.967-27.375-39.813zm-230.72 8.688l-36.31 10.968 25.968 37.782 36.312-10.968-25.97-37.78zm175.657 7.937l-32.625 9.875c-.35 4.407-1.012 8.72-2.03 12.906l20.312 29.595 41.687-12.563-27.342-39.812zm-230.75 8.688L100.094 248l25.97 37.813 41.592-12.594-25.97-37.783zm324.282 30.656l-36.314 10.97 26 37.81 36.313-10.937-26-37.843zm-232.095 6.687l-36.313 10.97 27.344 39.78 36.313-10.967-27.345-39.782zm177.03 9.94L369.22 295.31l25.967 37.813 41.688-12.563-25.97-37.843zm-232.124 6.686l-41.624 12.563 27.313 39.81 41.655-12.592-27.344-39.782zm152.314 8.47L301.78 316.5l37.314 58.656 29.312-18.625-37.312-58.655zm-58.75 30.874l-36.313 10.97 26 37.81 36.314-10.936-26-37.844zm-55.094 16.625l-41.656 12.594 25.97 37.81 41.655-12.56-25.97-37.845zm178.313 20.875c-36.29.507-64.44 29.054-70.375 64.844L368.5 404l9.72 14.406c-1.222 2.47-1.908 5.245-1.908 8.188 0 10.222 8.278 18.53 18.5 18.53 10.223 0 18.5-8.308 18.5-18.53 0-10.223-8.277-18.5-18.5-18.5-.335 0-.67.045-1 .062l-9.437-14.062 37.438-23.438c-9.068-3.125-17.876-4.523-26.25-4.406z"
            />
          </svg></span><span>فضائي</span>`;
    if (mobileBasemapBtn)
      mobileBasemapBtn.innerHTML = `<span>          <svg
            width="20px"
            height="20px"
            viewBox="0 0 512 512"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              fill="#aaa"
              d="M314.125 45.125l-36.28 10.97 26.717 38.874L340.844 84l-26.72-38.875zM260.47 61.313l-43 13 26.686 38.874 41.625-12.562-26.467-38.5 1.156-.813zm91.467 38.874l-36.28 10.938 27.374 39.813L379.314 140l-27.375-39.813zM120.47 107.78l-36.282 10.94 26.718 38.905 36.28-10.97-26.717-38.874zm176.405 9.032l-41.594 12.563 12.814 18.656c13.59 1.764 26.138 6.878 36.844 14.44l19.312-5.845-27.375-39.813zm-230.03 7.157l-43 12.968 26.718 38.906 41.562-12.563-26.47-38.5 1.19-.81zm323.56 32.155l-36.28 10.97 25.97 37.81 36.28-10.936-25.97-37.845zm-232.092 6.72L122 173.78l27.375 39.814 36.28-10.938-27.343-39.812zm99.125 3.186c-22.736 0-42.626 11.753-53.97 29.532l66.782 97.188c6.682-1.346 12.98-3.725 18.72-6.97l7.874 11.69 15.78-10.033-8.874-13.187c10.95-11.475 17.656-27.028 17.656-44.22 0-35.446-28.52-64-63.97-64zm77.906 6.75l-14.438 4.345c9.396 11.262 15.84 25.07 18.188 40.188l22.22-6.72-25.97-37.812zm-232.125 6.69L61.655 192l27.313 39.813 41.593-12.563-27.344-39.78zm324.28 30.655l-36.28 10.97 27.342 39.81 36.313-10.967-27.375-39.813zm-230.72 8.688l-36.31 10.968 25.968 37.782 36.312-10.968-25.97-37.78zm175.657 7.937l-32.625 9.875c-.35 4.407-1.012 8.72-2.03 12.906l20.312 29.595 41.687-12.563-27.342-39.812zm-230.75 8.688L100.094 248l25.97 37.813 41.592-12.594-25.97-37.783zm324.282 30.656l-36.314 10.97 26 37.81 36.313-10.937-26-37.843zm-232.095 6.687l-36.313 10.97 27.344 39.78 36.313-10.967-27.345-39.782zm177.03 9.94L369.22 295.31l25.967 37.813 41.688-12.563-25.97-37.843zm-232.124 6.686l-41.624 12.563 27.313 39.81 41.655-12.592-27.344-39.782zm152.314 8.47L301.78 316.5l37.314 58.656 29.312-18.625-37.312-58.655zm-58.75 30.874l-36.313 10.97 26 37.81 36.314-10.936-26-37.844zm-55.094 16.625l-41.656 12.594 25.97 37.81 41.655-12.56-25.97-37.845zm178.313 20.875c-36.29.507-64.44 29.054-70.375 64.844L368.5 404l9.72 14.406c-1.222 2.47-1.908 5.245-1.908 8.188 0 10.222 8.278 18.53 18.5 18.53 10.223 0 18.5-8.308 18.5-18.53 0-10.223-8.277-18.5-18.5-18.5-.335 0-.67.045-1 .062l-9.437-14.062 37.438-23.438c-9.068-3.125-17.876-4.523-26.25-4.406z"
            />
          </svg></span><span>فضائي</span>`;
  } else {
    map.removeLayer(streetLayer);
    satelliteLayer.addTo(map);
    basemapToggleBtn.innerHTML = `<span><svg fill="#aaa" width="20px" height="20px" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M7.97,2.242l-5,20A1,1,0,0,1,2,23a1.025,1.025,0,0,1-.244-.03,1,1,0,0,1-.727-1.212l5-20a1,1,0,1,1,1.94.484Zm10-.484a1,1,0,1,0-1.94.484l5,20A1,1,0,0,0,22,23a1.017,1.017,0,0,0,.243-.03,1,1,0,0,0,.728-1.212ZM12,1a1,1,0,0,0-1,1V6a1,1,0,0,0,2,0V2A1,1,0,0,0,12,1Zm0,7.912a1,1,0,0,0-1,1v4.176a1,1,0,1,0,2,0V9.912A1,1,0,0,0,12,8.912ZM12,17a1,1,0,0,0-1,1v4a1,1,0,0,0,2,0V18A1,1,0,0,0,12,17Z"/></svg></span><span>شوارع</span>`;

    if (mobileBasemapBtn)
      mobileBasemapBtn.innerHTML = `<span><svg fill="#aaa" width="20px" height="20px" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M7.97,2.242l-5,20A1,1,0,0,1,2,23a1.025,1.025,0,0,1-.244-.03,1,1,0,0,1-.727-1.212l5-20a1,1,0,1,1,1.94.484Zm10-.484a1,1,0,1,0-1.94.484l5,20A1,1,0,0,0,22,23a1.017,1.017,0,0,0,.243-.03,1,1,0,0,0,.728-1.212ZM12,1a1,1,0,0,0-1,1V6a1,1,0,0,0,2,0V2A1,1,0,0,0,12,1Zm0,7.912a1,1,0,0,0-1,1v4.176a1,1,0,1,0,2,0V9.912A1,1,0,0,0,12,8.912ZM12,17a1,1,0,0,0-1,1v4a1,1,0,0,0,2,0V18A1,1,0,0,0,12,17Z"/></svg></span><span>شوارع</span>`;
  }
  isSatellite = !isSatellite;
}

// Location buttons
const classicLocationBtn = document.getElementById('classic-location-btn');
if (classicLocationBtn) {
  classicLocationBtn.addEventListener('click', getCurrentLocation);
}

const sidebarLocationBtn = document.getElementById('location-btn');
if (sidebarLocationBtn) {
  sidebarLocationBtn.addEventListener('click', getCurrentLocation);
}

const mobileLocationBtn = document.getElementById('mobile-location-btn');
if (mobileLocationBtn) {
  mobileLocationBtn.addEventListener('click', getCurrentLocation);
}

// Theme toggle with persistence
const themeToggleBtn = document.getElementById('theme-toggle-btn');
const mobileThemeBtn = document.getElementById('mobile-theme-btn');
const storedTheme = localStorage.getItem('theme') || 'dark';
if (storedTheme === 'dark') {
  document.documentElement.classList.add('dark');
  if (themeToggleBtn)
    themeToggleBtn.innerHTML = `<span><svg fill="#aaa" width="20px" height="20px" viewBox="0 0 512 512" version="1.1" xmlns="http://www.w3.org/2000/svg">
<title>dark</title>
<path d="M9.75 8.25v0.219c0 0.844-0.375 1.25-1.156 1.25s-1.125-0.406-1.125-1.25v-0.219c0-0.813 0.344-1.219 1.125-1.219s1.156 0.406 1.156 1.219zM12.063 9.25l0.156-0.188c0.469-0.688 1.031-0.781 1.625-0.344 0.625 0.438 0.719 1.031 0.25 1.719l-0.188 0.156c-0.469 0.688-1.031 0.781-1.625 0.313-0.625-0.438-0.688-0.969-0.219-1.656zM5 9.063l0.125 0.188c0.469 0.688 0.406 1.219-0.188 1.656-0.625 0.469-1.219 0.375-1.688-0.313l-0.125-0.156c-0.469-0.688-0.406-1.281 0.188-1.719 0.625-0.438 1.219-0.281 1.688 0.344zM8.594 11.125c2.656 0 4.844 2.188 4.844 4.875 0 2.656-2.188 4.813-4.844 4.813-2.688 0-4.844-2.156-4.844-4.813 0-2.688 2.156-4.875 4.844-4.875zM1.594 12.5l0.219 0.063c0.813 0.25 1.063 0.719 0.844 1.469-0.25 0.75-0.75 0.969-1.531 0.719l-0.219-0.063c-0.781-0.25-1.063-0.719-0.844-1.469 0.25-0.75 0.75-0.969 1.531-0.719zM15.375 12.563l0.219-0.063c0.813-0.25 1.313-0.031 1.531 0.719s-0.031 1.219-0.844 1.469l-0.188 0.063c-0.813 0.25-1.313 0.031-1.531-0.719-0.25-0.75 0.031-1.219 0.813-1.469zM8.594 18.688c1.469 0 2.688-1.219 2.688-2.688 0-1.5-1.219-2.719-2.688-2.719-1.5 0-2.719 1.219-2.719 2.719 0 1.469 1.219 2.688 2.719 2.688zM0.906 17.281l0.219-0.063c0.781-0.25 1.281-0.063 1.531 0.688 0.219 0.75-0.031 1.219-0.844 1.469l-0.219 0.063c-0.781 0.25-1.281 0.063-1.531-0.688-0.219-0.75 0.063-1.219 0.844-1.469zM16.094 17.219l0.188 0.063c0.813 0.25 1.063 0.719 0.844 1.469s-0.719 0.938-1.531 0.688l-0.219-0.063c-0.781-0.25-1.063-0.719-0.813-1.469 0.219-0.75 0.719-0.938 1.531-0.688zM3.125 21.563l0.125-0.188c0.469-0.688 1.063-0.75 1.688-0.313 0.594 0.438 0.656 0.969 0.188 1.656l-0.125 0.188c-0.469 0.688-1.063 0.75-1.688 0.313-0.594-0.438-0.656-0.969-0.188-1.656zM13.906 21.375l0.188 0.188c0.469 0.688 0.375 1.219-0.25 1.656-0.594 0.438-1.156 0.375-1.625-0.313l-0.156-0.188c-0.469-0.688-0.406-1.219 0.219-1.656 0.594-0.438 1.156-0.375 1.625 0.313zM9.75 23.469v0.25c0 0.844-0.375 1.25-1.156 1.25s-1.125-0.406-1.125-1.25v-0.25c0-0.844 0.344-1.25 1.125-1.25s1.156 0.406 1.156 1.25z"></path>
</svg></span>`;
  if (mobileThemeBtn)
    mobileThemeBtn.innerHTML = `<span><svg fill="#aaa" width="20px" height="20px" viewBox="0 0 512 512" version="1.1" xmlns="http://www.w3.org/2000/svg">
<title>dark</title>
<path d="M9.75 8.25v0.219c0 0.844-0.375 1.25-1.156 1.25s-1.125-0.406-1.125-1.25v-0.219c0-0.813 0.344-1.219 1.125-1.219s1.156 0.406 1.156 1.219zM12.063 9.25l0.156-0.188c0.469-0.688 1.031-0.781 1.625-0.344 0.625 0.438 0.719 1.031 0.25 1.719l-0.188 0.156c-0.469 0.688-1.031 0.781-1.625 0.313-0.625-0.438-0.688-0.969-0.219-1.656zM5 9.063l0.125 0.188c0.469 0.688 0.406 1.219-0.188 1.656-0.625 0.469-1.219 0.375-1.688-0.313l-0.125-0.156c-0.469-0.688-0.406-1.281 0.188-1.719 0.625-0.438 1.219-0.281 1.688 0.344zM8.594 11.125c2.656 0 4.844 2.188 4.844 4.875 0 2.656-2.188 4.813-4.844 4.813-2.688 0-4.844-2.156-4.844-4.813 0-2.688 2.156-4.875 4.844-4.875zM1.594 12.5l0.219 0.063c0.813 0.25 1.063 0.719 0.844 1.469-0.25 0.75-0.75 0.969-1.531 0.719l-0.219-0.063c-0.781-0.25-1.063-0.719-0.844-1.469 0.25-0.75 0.75-0.969 1.531-0.719zM15.375 12.563l0.219-0.063c0.813-0.25 1.313-0.031 1.531 0.719s-0.031 1.219-0.844 1.469l-0.188 0.063c-0.813 0.25-1.313 0.031-1.531-0.719-0.25-0.75 0.031-1.219 0.813-1.469zM8.594 18.688c1.469 0 2.688-1.219 2.688-2.688 0-1.5-1.219-2.719-2.688-2.719-1.5 0-2.719 1.219-2.719 2.719 0 1.469 1.219 2.688 2.719 2.688zM0.906 17.281l0.219-0.063c0.781-0.25 1.281-0.063 1.531 0.688 0.219 0.75-0.031 1.219-0.844 1.469l-0.219 0.063c-0.781 0.25-1.281 0.063-1.531-0.688-0.219-0.75 0.063-1.219 0.844-1.469zM16.094 17.219l0.188 0.063c0.813 0.25 1.063 0.719 0.844 1.469s-0.719 0.938-1.531 0.688l-0.219-0.063c-0.781-0.25-1.063-0.719-0.813-1.469 0.219-0.75 0.719-0.938 1.531-0.688zM3.125 21.563l0.125-0.188c0.469-0.688 1.063-0.75 1.688-0.313 0.594 0.438 0.656 0.969 0.188 1.656l-0.125 0.188c-0.469 0.688-1.063 0.75-1.688 0.313-0.594-0.438-0.656-0.969-0.188-1.656zM13.906 21.375l0.188 0.188c0.469 0.688 0.375 1.219-0.25 1.656-0.594 0.438-1.156 0.375-1.625-0.313l-0.156-0.188c-0.469-0.688-0.406-1.219 0.219-1.656 0.594-0.438 1.156-0.375 1.625 0.313zM9.75 23.469v0.25c0 0.844-0.375 1.25-1.156 1.25s-1.125-0.406-1.125-1.25v-0.25c0-0.844 0.344-1.25 1.125-1.25s1.156 0.406 1.156 1.25z"></path>
</svg></span><span>سمة</span>`;
} else {
  if (themeToggleBtn)
    themeToggleBtn.innerHTML = `<span><svg width="20px" height="20px" viewBox="0 0 48 48" id="b" xmlns="http://www.w3.org/2000/svg"><defs><style>.c{fill:none;stroke:#000000;stroke-linecap:round;stroke-linejoin:round;}</style></defs><path class="c" d="m32.8,29.3c-8.9-.8-16.2-7.8-17.5-16.6-.3-1.8-.3-3.7,0-5.4.2-1.4-1.4-2.3-2.5-1.6C6.3,9.7,2.1,16.9,2.5,25c.5,10.7,9,19.5,19.7,20.4,10.6.9,19.8-6,22.5-15.6.4-1.4-1-2.6-2.3-2-2.9,1.3-6.1,1.8-9.6,1.5Z"/></svg></span>`;
  if (mobileThemeBtn)
    mobileThemeBtn.innerHTML = `<span><svg width="20px" height="20px" viewBox="0 0 48 48" id="b" xmlns="http://www.w3.org/2000/svg"><defs><style>.c{fill:none;stroke:#000000;stroke-linecap:round;stroke-linejoin:round;}</style></defs><path class="c" d="m32.8,29.3c-8.9-.8-16.2-7.8-17.5-16.6-.3-1.8-.3-3.7,0-5.4.2-1.4-1.4-2.3-2.5-1.6C6.3,9.7,2.1,16.9,2.5,25c.5,10.7,9,19.5,19.7,20.4,10.6.9,19.8-6,22.5-15.6.4-1.4-1-2.6-2.3-2-2.9,1.3-6.1,1.8-9.6,1.5Z"/></svg></span><span>سمة</span>`;
}

function toggleTheme() {
  const root = document.documentElement;
  const isDark = root.classList.toggle('dark');
  localStorage.setItem('theme', isDark ? 'dark' : 'light');

  if (themeToggleBtn)
    themeToggleBtn.innerHTML = isDark
      ? `<span><svg style="margin-top:3px;" fill="#aaa" width="20px" height="20px" viewBox="-7.5 0 32 32" version="1.1" xmlns="http://www.w3.org/2000/svg">
<title>dark</title>
<path d="M9.75 8.25v0.219c0 0.844-0.375 1.25-1.156 1.25s-1.125-0.406-1.125-1.25v-0.219c0-0.813 0.344-1.219 1.125-1.219s1.156 0.406 1.156 1.219zM12.063 9.25l0.156-0.188c0.469-0.688 1.031-0.781 1.625-0.344 0.625 0.438 0.719 1.031 0.25 1.719l-0.188 0.156c-0.469 0.688-1.031 0.781-1.625 0.313-0.625-0.438-0.688-0.969-0.219-1.656zM5 9.063l0.125 0.188c0.469 0.688 0.406 1.219-0.188 1.656-0.625 0.469-1.219 0.375-1.688-0.313l-0.125-0.156c-0.469-0.688-0.406-1.281 0.188-1.719 0.625-0.438 1.219-0.281 1.688 0.344zM8.594 11.125c2.656 0 4.844 2.188 4.844 4.875 0 2.656-2.188 4.813-4.844 4.813-2.688 0-4.844-2.156-4.844-4.813 0-2.688 2.156-4.875 4.844-4.875zM1.594 12.5l0.219 0.063c0.813 0.25 1.063 0.719 0.844 1.469-0.25 0.75-0.75 0.969-1.531 0.719l-0.219-0.063c-0.781-0.25-1.063-0.719-0.844-1.469 0.25-0.75 0.75-0.969 1.531-0.719zM15.375 12.563l0.219-0.063c0.813-0.25 1.313-0.031 1.531 0.719s-0.031 1.219-0.844 1.469l-0.188 0.063c-0.813 0.25-1.313 0.031-1.531-0.719-0.25-0.75 0.031-1.219 0.813-1.469zM8.594 18.688c1.469 0 2.688-1.219 2.688-2.688 0-1.5-1.219-2.719-2.688-2.719-1.5 0-2.719 1.219-2.719 2.719 0 1.469 1.219 2.688 2.719 2.688zM0.906 17.281l0.219-0.063c0.781-0.25 1.281-0.063 1.531 0.688 0.219 0.75-0.031 1.219-0.844 1.469l-0.219 0.063c-0.781 0.25-1.281 0.063-1.531-0.688-0.219-0.75 0.063-1.219 0.844-1.469zM16.094 17.219l0.188 0.063c0.813 0.25 1.063 0.719 0.844 1.469s-0.719 0.938-1.531 0.688l-0.219-0.063c-0.781-0.25-1.063-0.719-0.813-1.469 0.219-0.75 0.719-0.938 1.531-0.688zM3.125 21.563l0.125-0.188c0.469-0.688 1.063-0.75 1.688-0.313 0.594 0.438 0.656 0.969 0.188 1.656l-0.125 0.188c-0.469 0.688-1.063 0.75-1.688 0.313-0.594-0.438-0.656-0.969-0.188-1.656zM13.906 21.375l0.188 0.188c0.469 0.688 0.375 1.219-0.25 1.656-0.594 0.438-1.156 0.375-1.625-0.313l-0.156-0.188c-0.469-0.688-0.406-1.219 0.219-1.656 0.594-0.438 1.156-0.375 1.625 0.313zM9.75 23.469v0.25c0 0.844-0.375 1.25-1.156 1.25s-1.125-0.406-1.125-1.25v-0.25c0-0.844 0.344-1.25 1.125-1.25s1.156 0.406 1.156 1.25z"></path>
</svg></span>`
      : `<span><svg width="20px" height="20px" viewBox="0 0 48 48" id="b" xmlns="http://www.w3.org/2000/svg"><defs><style>.c{fill:none;stroke:#000000;stroke-linecap:round;stroke-linejoin:round;}</style></defs><path class="c" d="m32.8,29.3c-8.9-.8-16.2-7.8-17.5-16.6-.3-1.8-.3-3.7,0-5.4.2-1.4-1.4-2.3-2.5-1.6C6.3,9.7,2.1,16.9,2.5,25c.5,10.7,9,19.5,19.7,20.4,10.6.9,19.8-6,22.5-15.6.4-1.4-1-2.6-2.3-2-2.9,1.3-6.1,1.8-9.6,1.5Z"/></svg></span>`;

  if (mobileThemeBtn)
    mobileThemeBtn.innerHTML = isDark
      ? `<span><svg fill="#aaa" width="20px" height="20px" viewBox="-7.5 0 32 32" version="1.1" xmlns="http://www.w3.org/2000/svg">
<title>dark</title>
<path d="M9.75 8.25v0.219c0 0.844-0.375 1.25-1.156 1.25s-1.125-0.406-1.125-1.25v-0.219c0-0.813 0.344-1.219 1.125-1.219s1.156 0.406 1.156 1.219zM12.063 9.25l0.156-0.188c0.469-0.688 1.031-0.781 1.625-0.344 0.625 0.438 0.719 1.031 0.25 1.719l-0.188 0.156c-0.469 0.688-1.031 0.781-1.625 0.313-0.625-0.438-0.688-0.969-0.219-1.656zM5 9.063l0.125 0.188c0.469 0.688 0.406 1.219-0.188 1.656-0.625 0.469-1.219 0.375-1.688-0.313l-0.125-0.156c-0.469-0.688-0.406-1.281 0.188-1.719 0.625-0.438 1.219-0.281 1.688 0.344zM8.594 11.125c2.656 0 4.844 2.188 4.844 4.875 0 2.656-2.188 4.813-4.844 4.813-2.688 0-4.844-2.156-4.844-4.813 0-2.688 2.156-4.875 4.844-4.875zM1.594 12.5l0.219 0.063c0.813 0.25 1.063 0.719 0.844 1.469-0.25 0.75-0.75 0.969-1.531 0.719l-0.219-0.063c-0.781-0.25-1.063-0.719-0.844-1.469 0.25-0.75 0.75-0.969 1.531-0.719zM15.375 12.563l0.219-0.063c0.813-0.25 1.313-0.031 1.531 0.719s-0.031 1.219-0.844 1.469l-0.188 0.063c-0.813 0.25-1.313 0.031-1.531-0.719-0.25-0.75 0.031-1.219 0.813-1.469zM8.594 18.688c1.469 0 2.688-1.219 2.688-2.688 0-1.5-1.219-2.719-2.688-2.719-1.5 0-2.719 1.219-2.719 2.719 0 1.469 1.219 2.688 2.719 2.688zM0.906 17.281l0.219-0.063c0.781-0.25 1.281-0.063 1.531 0.688 0.219 0.75-0.031 1.219-0.844 1.469l-0.219 0.063c-0.781 0.25-1.281 0.063-1.531-0.688-0.219-0.75 0.063-1.219 0.844-1.469zM16.094 17.219l0.188 0.063c0.813 0.25 1.063 0.719 0.844 1.469s-0.719 0.938-1.531 0.688l-0.219-0.063c-0.781-0.25-1.063-0.719-0.813-1.469 0.219-0.75 0.719-0.938 1.531-0.688zM3.125 21.563l0.125-0.188c0.469-0.688 1.063-0.75 1.688-0.313 0.594 0.438 0.656 0.969 0.188 1.656l-0.125 0.188c-0.469 0.688-1.063 0.75-1.688 0.313-0.594-0.438-0.656-0.969-0.188-1.656zM13.906 21.375l0.188 0.188c0.469 0.688 0.375 1.219-0.25 1.656-0.594 0.438-1.156 0.375-1.625-0.313l-0.156-0.188c-0.469-0.688-0.406-1.219 0.219-1.656 0.594-0.438 1.156-0.375 1.625 0.313zM9.75 23.469v0.25c0 0.844-0.375 1.25-1.156 1.25s-1.125-0.406-1.125-1.25v-0.25c0-0.844 0.344-1.25 1.125-1.25s1.156 0.406 1.156 1.25z"></path>
</svg></span><span>سمة</span>`
      : `<span><svg width="20px" height="20px" viewBox="0 0 48 48" id="b" xmlns="http://www.w3.org/2000/svg"><defs><style>.c{fill:none;stroke:#000000;stroke-linecap:round;stroke-linejoin:round;}</style></defs><path class="c" d="m32.8,29.3c-8.9-.8-16.2-7.8-17.5-16.6-.3-1.8-.3-3.7,0-5.4.2-1.4-1.4-2.3-2.5-1.6C6.3,9.7,2.1,16.9,2.5,25c.5,10.7,9,19.5,19.7,20.4,10.6.9,19.8-6,22.5-15.6.4-1.4-1-2.6-2.3-2-2.9,1.3-6.1,1.8-9.6,1.5Z"/></svg></span><span>سمة</span>`;
}

if (themeToggleBtn) {
  themeToggleBtn.addEventListener('click', toggleTheme);
}

if (mobileThemeBtn) {
  mobileThemeBtn.addEventListener('click', toggleTheme);
}

// Initialize the map
streetLayer.addTo(map);

// user profile
// --- User Profile Handling ---
function loadProfile() {
  const profile = JSON.parse(localStorage.getItem('userProfile')) || {};
  console.log(profile);
  if (profile.name)
    document.getElementById('user-name').innerText = profile.name;
  if (profile.car) document.getElementById('user-car').innerText = profile.car;
  if (profile.img) {
    document.getElementById('user-img').src = profile.img;
    document.getElementById('mobile-user-img').src = profile.img;
  }
  // Mobile
  if (profile.name)
    document.getElementById('mobile-user-name').innerText = profile.name;
  if (profile.car)
    document.getElementById('mobile-user-car').innerText = profile.car;
}
// ============
// User profile modal logic
// ============
const modal = document.getElementById('profile-modal');
const openBtns = [
  document.getElementById('edit-profile-btn'),
  document.getElementById('mobile-edit-profile-btn'),
];
const closeBtn = document.getElementById('close-profile-btn');
const saveBtn = document.getElementById('save-profile-btn');

function openProfileModal() {
  // Pre-fill inputs with current profile values
  const p = JSON.parse(localStorage.getItem('userProfile')) || {};
  document.getElementById('input-name').value = p.name || '';
  document.getElementById('input-email').value = p.email || '';
  document.getElementById('input-car').value = p.car || '';
  document.getElementById('input-img').value = null;

  modal.classList.add('is-open');
  modal.setAttribute('aria-hidden', 'false');
}

function closeProfileModal() {
  modal.classList.remove('is-open');
  modal.setAttribute('aria-hidden', 'true');
}

// Open buttons (desktop + mobile)
openBtns.forEach(
  (btn) => btn && btn.addEventListener('click', openProfileModal)
);
// Close button
closeBtn && closeBtn.addEventListener('click', closeProfileModal);
// Close by clicking outside
modal.addEventListener('click', (e) => {
  if (e.target === modal) closeProfileModal();
});
// Close by Esc
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && modal.classList.contains('is-open'))
    closeProfileModal();
});

// Save profile
saveBtn &&
  saveBtn.addEventListener('click', () => {
    const name = document.getElementById('input-name').value.trim();
    const email = document.getElementById('input-email').value.trim();
    const car = document.getElementById('input-car').value.trim();
    const imgFile = document.getElementById('input-img').files[0];

    const persist = (img) => {
      const profile = { name, email, car, img };
      localStorage.setItem('userProfile', JSON.stringify(profile));
      loadProfile();
      closeProfileModal();
    };

    if (imgFile) {
      const reader = new FileReader();
      reader.onload = () => persist(reader.result);
      reader.readAsDataURL(imgFile);
    } else {
      const current = JSON.parse(localStorage.getItem('userProfile')) || {};
      persist(current.img);
    }
  });

// Initial load
loadProfile();

function saveProfile(name, email, car, img) {
  const profile = { name, email, car, img };
  localStorage.setItem('userProfile', JSON.stringify(profile));
  loadProfile();
  closeProfileModal();
}

// Load on page start
loadProfile();

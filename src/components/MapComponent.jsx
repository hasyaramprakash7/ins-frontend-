import React, { useRef, useEffect, useCallback, useState } from 'react';
import maplibregl from 'maplibre-gl';
import { useDispatch, useSelector } from 'react-redux';
import { fetchBuildings, setRoute, setError } from '../redux/mapSlice';
import axios from 'axios';
import InfoPanel from './InfoPanel';
import View360 from './View360';

// --- CONFIGURATION CONSTANTS ---
const MAP_STYLE_URL = 'https://tiles.stadiamaps.com/styles/alidade_satellite.json';
const API_BASE_URL = 'https://ins-back-end.onrender.com/api/map'; // Express Backend
const DEFAULT_CENTER = { lng: 83.23, lat: 17.72, zoom: 14, pitch: 65 };
const NOMINATIM_API_URL = 'https://nominatim.openstreetmap.org/search';
const REVERSE_NOMINATIM_API_URL = 'https://nominatim.openstreetmap.org/reverse';

// --- GeoJSON Source/Layer IDs ---
const ROUTE_POINT_SOURCE_ID = 'route-point-source';
const ROUTE_POINT_LAYER_ID = 'route-point-layer';
const BOX_SOURCE_ID = 'box-polygon-source';
const BOX_LAYER_ID = 'box-polygon-layer';
const CLICKED_POINTS_SOURCE_ID = 'clicked-points-source';
const COLLECTED_COORDS_SOURCE_ID = 'collected-coords-source';
const COLLECTED_COORDS_LAYER_ID = 'collected-coords-layer';
const MAX_LOGGED_CLICKS = 1;
const MAX_COLLECTED_POINTS = 155;

// Category options for filtering
const CATEGORY_OPTIONS = ['All', 'Building', 'Cabin', 'Security Pillar', 'Gate', 'Other', "main"];
const BUILDING_LAYER_ID = 'buildings-3d';
const PHOTO_MARKER_LAYER_ID = 'building-marker'; // Consistent name for photo marker layer
const DEBOUNCE_DELAY = 300;

// --- STYLING CONSTANTS ---
const COLOR_GOLD = '#d4af37';
const COLOR_PURPLE = '#9400d3';
const COLOR_ROUTE_GREEN = '#047857';


// --- API FUNCTIONS (Retained from original input) ---

// Forward Geocoding (Search & Suggestions)
const fetchCoordinates = async (query, limit = 1) => {
    if (limit > 1 && query.length < 3) return [];

    try {
        const response = await axios.get(NOMINATIM_API_URL, {
            params: { q: query, format: 'json', limit: limit, addressdetails: 1 }
        });

        if (response.data && response.data.length > 0) {
            return response.data.map(result => ({
                name: result.display_name,
                lng: parseFloat(result.lon),
                lat: parseFloat(result.lat),
                zoom: result.type === 'city' || result.type === 'administrative' ? 12 : 14
            }));
        } else {
            return [];
        }
    } catch (error) {
        return [];
    }
};

// Reverse Geocoding (Pincode/Address Lookup on Map Click)
const fetchPincodeAndAddress = async (lat, lng) => {
    try {
        const response = await axios.get(REVERSE_NOMINATIM_API_URL, {
            params: {
                lat: lat,
                lon: lng,
                format: 'json',
                addressdetails: 1,
                zoom: 18
            }
        });

        if (response.data && response.data.address) {
            const address = response.data.address;
            const pincode = address.postcode || 'N/A';
            const fullAddress = response.data.display_name || 'Address Not Found';

            return {
                pincode: pincode,
                latitude: lat.toFixed(6),
                longitude: lng.toFixed(6),
                fullAddress: fullAddress
            };
        } else {
            return {
                pincode: 'N/A',
                latitude: lat.toFixed(6),
                longitude: lng.toFixed(6),
                fullAddress: 'No Address Data Found'
            };
        }
    } catch (error) {
        console.error("Reverse Geocoding failed:", error);
        return {
            pincode: 'Error',
            latitude: lat.toFixed(6),
            longitude: lng.toFixed(6),
            fullAddress: 'Service Error'
        };
    }
};


function MapComponent() {
    const mapContainer = useRef(null);
    const map = useRef(null);
    const debounceTimeout = useRef(null);

    // --- NEW SEARCH & GEOCODING STATES ---
    const [searchQuery, setSearchQuery] = useState('');
    const [searchSuggestions, setSearchSuggestions] = useState([]);
    const [searchError, setSearchError] = useState(null);
    const [reverseGeocodeInfo, setReverseGeocodeInfo] = useState(null);
    const [isReverseGeocoding, setIsReverseGeocoding] = useState(false);

    // State management (from original)
    const [mapCenter, setMapCenter] = useState({ lng: 83.21, lat: 17.72 });
    const [selectedFeature, setSelectedFeature] = useState(null);
    const [view360Url, setView360Url] = useState(null);
    // RESTORED: Internal state for category filtering
    const [activeCategory, setActiveCategory] = useState('All');
    const [isCoordinateFormOpen, setIsCoordinateFormOpen] = useState(false);

    // Interaction States (from original)
    const [routePoints, setRoutePoints] = useState([]);
    const [loggedClicks, setLoggedClicks] = useState([]);
    const [collectedCoordinates, setCollectedCoordinates] = useState([]);

    // Redux Hooks
    const dispatch = useDispatch();
    const { buildings, route, loading, error } = useSelector((state) => state.map);

    // --- HANDLERS ---

    // Map flyto helper
    const flyToLocation = useCallback((lng, lat, zoom) => {
        if (map.current) {
            map.current.flyTo({
                center: [lng, lat],
                zoom: zoom || 14,
                essential: true
            });
            setSearchSuggestions([]);
            setSearchQuery('');
            setSearchError(null);
            setReverseGeocodeInfo(null); // Clear manual click info on search fly
        }
    }, []);

    // Reverse Geocoding Handler
    const handleReverseGeocode = useCallback(async (lng, lat) => {
        setIsReverseGeocoding(true);
        const info = await fetchPincodeAndAddress(lat, lng);
        setReverseGeocodeInfo(info);
        setIsReverseGeocoding(false);
    }, []);

    // Primary Search Handler
    const handleSearch = useCallback(async (e) => {
        e.preventDefault();
        setSearchError(null);
        setSearchSuggestions([]);
        if (!map.current || !searchQuery.trim()) return;

        try {
            const results = await fetchCoordinates(searchQuery.trim(), 1);
            if (results.length > 0) {
                const { lng, lat, zoom } = results[0];
                flyToLocation(lng, lat, zoom);
            } else {
                setSearchError("Location/Pincode not found or ambiguous.");
            }
        } catch (err) {
            setSearchError(err.message || "Search service failed to connect.");
        }
    }, [searchQuery, flyToLocation]);


    // Resets ONLY the collected coordinates
    const resetCollectedCoordinates = useCallback(() => {
        setCollectedCoordinates([]);
        if (collectedCoordinates.length === 0) setIsCoordinateFormOpen(false);
    }, [collectedCoordinates.length]);

    // Handler to close the InfoPanel/Clear selected feature
    const handleCancelInfoPanel = useCallback(() => {
        setSelectedFeature(null);
        setView360Url(null);
    }, []);

    // RESTORED: Sets the active category filter
    const handleCategoryClick = (category) => {
        setActiveCategory(category);
    };

    // Calculates and displays route from map center to a target point
    const handleRoute = useCallback(async (endPoint) => {
        if (!map.current) return;
        const startPoint = map.current.getCenter();
        try {
            dispatch(setRoute(null));
            const response = await axios.post(`${API_BASE_URL}/route`, {
                startLng: startPoint.lng, startLat: startPoint.lat,
                endLng: endPoint.lng, endLat: endPoint.lat
            });
            dispatch(setRoute(response.data));
            map.current.flyTo({ center: startPoint, zoom: 16, essential: true });
        } catch (err) {
            console.error("Routing failed:", err);
            dispatch(setError("Routing failed. Check routing service connection."));
        }
    }, [dispatch]);

    // Resets the map view and clears all interactions/states
    const resetMapView = useCallback(() => {
        if (map.current) {
            map.current.flyTo({
                center: [DEFAULT_CENTER.lng, DEFAULT_CENTER.lat],
                zoom: DEFAULT_CENTER.zoom,
                pitch: DEFAULT_CENTER.pitch,
                bearing: 0,
                essential: true
            });
            // Clear all interactions and states
            setRoutePoints([]);
            setCollectedCoordinates([]);
            setLoggedClicks([]);
            dispatch(setRoute(null));
            setSelectedFeature(null);
            setView360Url(null);
            setIsCoordinateFormOpen(false);
            setActiveCategory('All'); // RESTORED: Reset category state
            setSearchSuggestions([]);
            setReverseGeocodeInfo(null);

            if (map.current.getSource(BOX_SOURCE_ID)) {
                map.current.getSource(BOX_SOURCE_ID).setData({ type: 'FeatureCollection', features: [] });
            }
        }
    }, [dispatch]);


    // --- EFFECTS ---

    // Fetch buildings once on mount
    useEffect(() => {
        dispatch(fetchBuildings());
    }, [dispatch]);

    // Autosuggest Debounced Fetch
    useEffect(() => {
        if (debounceTimeout.current) {
            clearTimeout(debounceTimeout.current);
        }

        if (searchQuery.length < 3) {
            setSearchSuggestions([]);
            return;
        }

        debounceTimeout.current = setTimeout(async () => {
            try {
                const suggestions = await fetchCoordinates(searchQuery, 5);
                setSearchSuggestions(suggestions);
            } catch (err) {
                // Ignore silent fetch errors for suggestions
            }
        }, DEBOUNCE_DELAY);

        return () => {
            if (debounceTimeout.current) {
                clearTimeout(debounceTimeout.current);
            }
        };
    }, [searchQuery]);


    // MAPLIBRE INITIALIZATION & EVENT HANDLERS
    useEffect(() => {
        if (map.current || !buildings) return;

        map.current = new maplibregl.Map({
            container: mapContainer.current,
            style: MAP_STYLE_URL,
            center: [DEFAULT_CENTER.lng, DEFAULT_CENTER.lat],
            zoom: DEFAULT_CENTER.zoom, pitch: DEFAULT_CENTER.pitch
        });

        map.current.on('move', () => {
            const center = map.current.getCenter();
            setMapCenter({ lng: center.lng.toFixed(4), lat: center.lat.toFixed(4) });
        });

        // Handler 1: MOUSE DOWN (Logging & Right-Click Coordinate Collection)
        map.current.on('mousedown', (e) => {
            const { lng, lat } = e.lngLat;
            const buttonType = e.originalEvent.button === 0 ? 'LEFT' : (e.originalEvent.button === 2 ? 'RIGHT' : 'OTHER');
            const newClick = { lng: lng.toFixed(4), lat: lat.toFixed(4), button: buttonType };

            setLoggedClicks(prev => [newClick, ...prev.slice(0, MAX_LOGGED_CLICKS - 1)]);

            if (e.originalEvent.button === 2) { // Right-click (Context menu)
                e.originalEvent.preventDefault();

                // LOGIC: Collect Coordinate on Right-Click Down
                setCollectedCoordinates(prev => {
                    if (prev.length >= MAX_COLLECTED_POINTS) {
                        console.log(`Max ${MAX_COLLECTED_POINTS} coordinates collected.`);
                        return prev;
                    }
                    const newPoint = { lng: lng.toFixed(6), lat: lat.toFixed(6) };
                    return [...prev, newPoint];
                });

                // Clear other interaction states on right-click to prioritize data collection
                setRoutePoints([]);
                dispatch(setRoute(null));
            }
        });

        // Handler 2: LEFT-CLICK (Reverse Geocoding or Clearing)
        map.current.on('click', (e) => {
            if (e.originalEvent.button !== 0) return; // Only process left-click
            const { lng, lat } = e.lngLat;

            const features = map.current.queryRenderedFeatures(e.point);
            const isFeatureClicked = features.some(f =>
                f.layer.id === BUILDING_LAYER_ID ||
                f.layer.id === 'viewpoint-markers' ||
                f.layer.id === PHOTO_MARKER_LAYER_ID
            );

            if (isFeatureClicked) {
                // If a feature was clicked, stop the click handler so the feature logic can run.
                setReverseGeocodeInfo(null);
                return;
            }

            // Clear map interaction states
            if (routePoints.length > 0 || route) {
                setRoutePoints([]);
                dispatch(setRoute(null));
            }
            setSelectedFeature(null);
            setView360Url(null);
            setSearchSuggestions([]);

            // Perform Reverse Geocoding for the clicked point
            handleReverseGeocode(lng, lat);
        });

        // Handler 3: CONTEXT MENU (Right-Click for 360 View - overrides default browser menu)
        map.current.on('contextmenu', (e) => {
            e.preventDefault();

            // Check for Marker Click (Priority for 360 View)
            const features = map.current.queryRenderedFeatures(e.point, { layers: ['viewpoint-markers', PHOTO_MARKER_LAYER_ID] });

            if (features.length > 0) {
                const feature = features[0];
                if (feature.properties.imageURL) {
                    setSelectedFeature({
                        name: feature.properties.name,
                        id: feature.properties.id,
                        imageURL: feature.properties.imageURL,
                        category: feature.properties.category,
                        centerPoint: { lng: e.lngLat.lng, lat: e.lngLat.lat }
                    });
                    setView360Url(feature.properties.imageURL);
                    map.current.flyTo({ center: feature.geometry.coordinates, pitch: 60, zoom: 16 });

                    // Clear coordinate collection when entering 360 view
                    setCollectedCoordinates([]);
                    setIsCoordinateFormOpen(false);
                }
            }
        });

        map.current.on('load', () => {
            const cleanupLayersAndSources = (id) => {
                if (map.current.getLayer(id)) map.current.removeLayer(id);
                if (map.current.getSource(id)) map.current.removeSource(id);
            };

            // Cleanup layers/sources
            cleanupLayersAndSources(BUILDING_LAYER_ID);
            cleanupLayersAndSources('buildings');
            cleanupLayersAndSources('viewpoint-markers');
            cleanupLayersAndSources('viewpoint-source');
            cleanupLayersAndSources('route-line');
            cleanupLayersAndSources('route-source');
            cleanupLayersAndSources(ROUTE_POINT_LAYER_ID);
            cleanupLayersAndSources(ROUTE_POINT_SOURCE_ID);
            cleanupLayersAndSources(BOX_LAYER_ID);
            cleanupLayersAndSources(BOX_SOURCE_ID);
            cleanupLayersAndSources('clicked-points-layer');
            cleanupLayersAndSources(CLICKED_POINTS_SOURCE_ID);
            cleanupLayersAndSources(COLLECTED_COORDS_LAYER_ID);
            cleanupLayersAndSources(COLLECTED_COORDS_SOURCE_ID);

            // Building/Marker feature transformation logic
            const viewpointMarkers = {
                type: "FeatureCollection", features: buildings.features.map(feature => {
                    let pointCoords;
                    if (feature.properties.viewpoint && feature.properties.viewpoint.coordinates) {
                        pointCoords = feature.properties.viewpoint.coordinates;
                    } else if (feature.geometry.coordinates && feature.geometry.coordinates.length > 0 && feature.geometry.type === 'Polygon') {
                        const coords = feature.geometry.coordinates[0];
                        const centerLng = coords.reduce((sum, p) => sum + p[0], 0) / coords.length;
                        const centerLat = coords.reduce((sum, p) => sum + p[1], 0) / coords.length;
                        pointCoords = [centerLng, centerLat];
                    } else {
                        pointCoords = [0, 0];
                    }

                    return {
                        type: "Feature",
                        geometry: { type: "Point", coordinates: pointCoords },
                        properties: { ...feature.properties }
                    };
                })
            };

            // --- Add Sources ---
            map.current.addSource('buildings', { type: 'geojson', data: buildings });
            map.current.addSource('viewpoint-source', { type: 'geojson', data: viewpointMarkers });
            map.current.addSource(ROUTE_POINT_SOURCE_ID, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
            map.current.addSource(BOX_SOURCE_ID, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
            map.current.addSource(CLICKED_POINTS_SOURCE_ID, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
            map.current.addSource(COLLECTED_COORDS_SOURCE_ID, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });


            // --- Add Layers ---
            map.current.addLayer({
                'id': BUILDING_LAYER_ID, 'type': 'fill-extrusion', 'source': 'buildings',
                'paint': { 'fill-extrusion-color': COLOR_GOLD, 'fill-extrusion-height': ['get', 'height'], 'fill-extrusion-base': 0, 'fill-extrusion-opacity': 1 }
            });
            map.current.addLayer({
                'id': ROUTE_POINT_LAYER_ID, 'type': 'circle', 'source': ROUTE_POINT_SOURCE_ID,
                'paint': { 'circle-color': ['match', ['get', 'index'], 0, COLOR_ROUTE_GREEN, 1, '#b91c1c', '#333'], 'circle-radius': 10, 'circle-stroke-width': 2, 'circle-stroke-color': '#ffffff' }
            });
            map.current.addLayer({
                'id': BOX_LAYER_ID, 'type': 'fill', 'source': BOX_SOURCE_SOURCE_ID, 'layout': {},
                'paint': { 'fill-color': COLOR_GOLD, 'fill-opacity': 0.3, 'fill-outline-color': COLOR_GOLD }
            });
            map.current.addLayer({
                'id': 'clicked-points-layer', 'type': 'circle', 'source': CLICKED_POINTS_SOURCE_ID,
                'paint': { 'circle-color': '#6b7280', 'circle-radius': 4, 'circle-stroke-width': 1, 'circle-stroke-color': '#ffffff' }
            });

            // 360 Photo Marker Logic (Symbol Layer)
            map.current.loadImage('/camera-icon.png', (error, image) => {
                if (!error && !map.current.hasImage('camera-icon')) {
                    map.current.addImage('camera-icon', image, { pixelRatio: 2 });
                    map.current.addLayer({
                        'id': PHOTO_MARKER_LAYER_ID, 'type': 'symbol', 'source': 'viewpoint-source',
                        'layout': { 'icon-image': 'camera-icon', 'icon-size': 0.12, 'visibility': ['case', ['has', 'imageURL'], 'visible', 'none'] },
                        'filter': ['has', 'imageURL']
                    });
                }
            });

            // --- Feature Click Handlers ---
            map.current.on('click', BUILDING_LAYER_ID, (e) => {
                const feature = e.features[0];
                const coords = feature.geometry.coordinates[0];
                const centerLng = coords.reduce((sum, p) => sum + p[0], 0) / coords.length;
                const centerLat = coords.reduce((sum, p) => sum + p[1], 0) / coords.length;
                setSelectedFeature({ name: feature.properties.name, id: feature.properties.id, imageURL: feature.properties.imageURL, category: feature.properties.category, centerPoint: { lng: centerLng, lat: centerLat } });
                map.current.flyTo({ center: [centerLng, centerLat], pitch: 60, zoom: 16 });
                setReverseGeocodeInfo(null);
            });

            map.current.on('click', PHOTO_MARKER_LAYER_ID, (e) => {
                const feature = e.features[0];
                setSelectedFeature({ name: feature.properties.name, id: feature.properties.id, imageURL: feature.properties.imageURL, category: feature.properties.category, centerPoint: { lng: feature.geometry.coordinates[0], lat: feature.geometry.coordinates[1] } });
                if (feature.properties.imageURL) { setView360Url(feature.properties.imageURL); }
                map.current.flyTo({ center: feature.geometry.coordinates, pitch: 60, zoom: 16 });
                setReverseGeocodeInfo(null);
            });
        });

        // Cleanup on component unmount
        return () => {
            map.current?.remove();
            map.current = null;
        };
    }, [buildings, dispatch, handleReverseGeocode]);


    // --- EFFECT: CATEGORY FILTERING AND COLORING LOGIC ---
    useEffect(() => {
        if (!map.current || !map.current.isStyleLoaded()) return;

        const extrusionColor = activeCategory === 'All' ? COLOR_GOLD : COLOR_PURPLE;

        if (map.current.getLayer(BUILDING_LAYER_ID)) {
            map.current.setPaintProperty(BUILDING_LAYER_ID, 'fill-extrusion-color', extrusionColor);
            map.current.setFilter(BUILDING_LAYER_ID, activeCategory === 'All' ? null : ['==', ['get', 'category'], activeCategory]);
        }

        if (map.current.getLayer(PHOTO_MARKER_LAYER_ID)) {
            map.current.setFilter(PHOTO_MARKER_LAYER_ID, activeCategory === 'All'
                ? ['has', 'imageURL']
                : ['all', ['has', 'imageURL'], ['==', ['get', 'category'], activeCategory]]
            );
        }
    }, [activeCategory]); // Depends on internal activeCategory state

    // --- EFFECT: ROUTE LINE RENDERING ---
    useEffect(() => {
        if (!map.current || !map.current.isStyleLoaded()) return;

        const routeLayerId = 'route-line';
        const routeSourceId = 'route-source';
        const sourceExists = map.current.getSource(routeSourceId);

        if (route) {
            if (sourceExists) {
                map.current.getSource(routeSourceId).setData(route);
            } else {
                map.current.addSource(routeSourceId, { type: 'geojson', data: route });
                map.current.addLayer({
                    'id': routeLayerId, 'type': 'line', 'source': routeSourceId,
                    'layout': { 'line-join': 'round', 'line-cap': 'round' },
                    'paint': { 'line-color': COLOR_ROUTE_GREEN, 'line-width': 6, 'line-dasharray': [2, 1] }
                });
            }
        } else if (!route && sourceExists) {
            map.current.getSource(routeSourceId).setData({ type: 'FeatureCollection', features: [] });
        }
    }, [route]);

    // --- EFFECT: ROUTE POINT RENDERING ---
    useEffect(() => {
        if (!map.current || !map.current.isStyleLoaded()) return;

        const routeGeoJSON = {
            type: 'FeatureCollection',
            features: routePoints.map((point, index) => ({
                type: 'Feature', geometry: { type: 'Point', coordinates: [point.lng, point.lat] },
                properties: { id: `route-point-${index}`, index: index }
            }))
        };
        if (map.current.getSource(ROUTE_POINT_SOURCE_ID)) {
            map.current.getSource(ROUTE_POINT_SOURCE_ID).setData(routeGeoJSON);
        }
    }, [routePoints]);

    // --- EFFECT: COLLECTED COORDINATES VISUALIZATION (Right-Click Data) ---
    useEffect(() => {
        if (!map.current || !map.current.isStyleLoaded()) return;

        if (!map.current.getSource(COLLECTED_COORDS_SOURCE_ID)) {
            map.current.addSource(COLLECTED_COORDS_SOURCE_ID, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
            map.current.addLayer({
                'id': COLLECTED_COORDS_LAYER_ID, 'type': 'circle', 'source': COLLECTED_COORDS_SOURCE_ID,
                'paint': { 'circle-color': COLOR_GOLD, 'circle-radius': 7, 'circle-stroke-width': 2, 'circle-stroke-color': '#ffffff' }
            });
        }

        const features = collectedCoordinates.map(point => ({
            type: 'Feature', geometry: { type: 'Point', coordinates: [parseFloat(point.lng), parseFloat(point.lat)] }, properties: {}
        }));

        map.current.getSource(COLLECTED_COORDS_SOURCE_ID).setData({ type: 'FeatureCollection', features });

    }, [collectedCoordinates]);


    // --- RENDER HELPERS: Reverse Geocoding Panel ---
    const getReverseGeocodePanel = () => {
        if (!reverseGeocodeInfo && !isReverseGeocoding) return null;

        return (
            <div className="mt-4 p-3 bg-blue-950/70 backdrop-blur-sm rounded-lg shadow-xl text-xs sm:text-sm font-mono text-amber-300 border border-amber-300/30">
                <p className="font-serif font-bold text-white mb-2 border-b border-amber-300/30 pb-1">
                    Clicked Location Data
                </p>
                {isReverseGeocoding ? (
                    <p className="text-yellow-400">Fetching Pincode... 📡</p>
                ) : (
                    <>
                        <p className="truncate text-gray-300"><span className="text-gray-500">Address:</span> {reverseGeocodeInfo.fullAddress}</p>
                        <p className="text-amber-300/90"><span className="text-gray-500">Pincode:</span> **{reverseGeocodeInfo.pincode}**</p>
                        <p className="text-amber-300/90"><span className="text-gray-500">Lat:</span> **{reverseGeocodeInfo.latitude}**</p>
                        <p className="text-amber-300/90"><span className="text-gray-500">Long:</span> **{reverseGeocodeInfo.longitude}**</p>
                    </>
                )}
            </div>
        );
    };


    // --- RENDER HELPERS: Data Acquisition / Interaction Log ---

    const getCollectedCoordsDisplay = () => {
        if (!isCoordinateFormOpen) return null;

        return (
            <div className="mt-2 pt-2 border-t border-amber-300/50">
                <p className="font-serif font-bold text-amber-300 text-sm tracking-wider">
                    Data Acquisition ({collectedCoordinates.length} / {MAX_COLLECTED_POINTS})
                </p>
                <p className="text-blue-400 font-semibold text-sm mt-1 leading-snug">
                    Use **RIGHT-CLICK** to add points.
                </p>
                <div className="max-h-32 overflow-y-auto mt-2 p-2 border border-blue-900 rounded bg-stone-900/50">
                    {collectedCoordinates.map((point, index) => (
                        <p key={index} className={`text-xs text-amber-300 font-mono truncate border-b border-blue-900 last:border-b-0 py-0.5`}>
                            <span className="text-blue-500 mr-2">{index + 1}.</span> Lng: {point.lng}, Lat: {point.lat}
                        </p>
                    ))}
                </div>
                {collectedCoordinates.length === MAX_COLLECTED_POINTS && (
                    <p className="text-red-400 font-bold text-xs mt-2">MAXIMUM {MAX_COLLECTED_POINTS} POINTS REACHED</p>
                )}

                {collectedCoordinates.length > 0 && (
                    <button
                        onClick={resetCollectedCoordinates}
                        className="w-full mt-3 bg-red-900 hover:bg-red-800 text-amber-300 font-serif py-1.5 px-4 rounded-full text-xs transition duration-300 shadow-lg"
                    >
                        Clear All Collected Coordinates
                    </button>
                )}
            </div>
        );
    };

    const getAllClickedCoordsDisplay = () => {
        if (loggedClicks.length === 0) return null;
        return (
            <div className="mt-2 pt-2 border-t border-amber-300/50">
                <p className="font-serif font-bold text-amber-300/80 text-xs tracking-wider">Recent Map Interaction Log</p>
                {loggedClicks.map((click, index) => (
                    <p key={index} className={`text-xs font-mono ${click.button === 'RIGHT' ? 'text-red-400' : 'text-gray-400'}`}>
                        {click.button}: Lng: {click.lng}, Lat: {click.lat}
                    </p>
                ))}
            </div>
        );
    };

    // --- MAIN RENDER ---
    return (
        <>
            {/* Error/Loading */}
            {error && <div className="flex justify-center items-center h-screen text-3xl font-serif font-bold text-red-400 bg-stone-900/90 z-50 absolute inset-0">Error: {error}</div>}
            {loading && <div className="flex justify-center items-center h-screen text-3xl font-serif font-bold text-amber-300 bg-stone-900/90 z-50 absolute inset-0">Loading Geospatial Data... 🏰</div>}

            {/* Map Container */}
            <div className="w-full h-screen absolute top-0 left-0">
                <div ref={mapContainer} className="w-full h-full" />
            </div>

            {/* 1. Search Bar & Suggestions + Reverse Geocoding Panel (Top Left Container) */}
            <div className="absolute top-4 left-4 z-30 w-80 max-w-[90%]">

                {/* Search Form (Luxury Style) */}
                <form
                    onSubmit={handleSearch}
                    className="flex shadow-2xl rounded-lg overflow-hidden border-2 border-amber-300/70"
                >
                    <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Search Location or Pincode..."
                        className="flex-grow p-3 text-sm font-serif tracking-wide text-stone-900 bg-amber-200 focus:bg-white placeholder-stone-700 focus:outline-none transition duration-150"
                    />
                    <button
                        type="submit"
                        className="p-3 bg-blue-950 hover:bg-amber-600 transition duration-300 text-amber-300 font-bold text-sm flex-shrink-0"
                    >
                        <span className="hidden sm:inline">Search</span> 🔍
                    </button>
                </form>

                {/* Search Suggestions Dropdown */}
                {searchSuggestions.length > 0 && (
                    <div className="mt-1 bg-stone-950/95 backdrop-blur-sm rounded-lg shadow-2xl border border-amber-300/50 max-h-60 overflow-y-auto">
                        {searchSuggestions.map((suggestion, index) => (
                            <div
                                key={index}
                                onClick={() => flyToLocation(suggestion.lng, suggestion.lat, suggestion.zoom)}
                                className="p-3 text-xs text-amber-300 hover:bg-blue-900/80 cursor-pointer border-b border-amber-300/20 last:border-b-0 transition duration-100"
                            >
                                <p className="font-semibold">{suggestion.name}</p>
                            </div>
                        ))}
                    </div>
                )}

                {/* Search Error */}
                {searchError && (
                    <div className="mt-2 bg-red-900 p-2 text-xs text-amber-300 rounded shadow-lg">
                        {searchError}
                    </div>
                )}

                {/* Reverse Geocoding Panel */}
                {getReverseGeocodePanel()}
            </div>


            {/* 2. Coordinate Display & Status Overlay (Top Right - Map Console) */}
            <div
                className="absolute top-4 right-4 bg-stone-950/70 backdrop-blur-sm p-4 rounded-xl shadow-2xl z-20 text-base font-mono text-amber-300 border border-amber-300/30"
                style={{ maxWidth: '300px', maxHeight: '50vh' }}
            >
                <p className="text-lg font-serif tracking-widest text-white mb-2">Imperial Map Console</p>
                {/* Longitude and Latitude coordinates REMOVED from the Top Right Console */}

                {getCollectedCoordsDisplay()}
                {getAllClickedCoordsDisplay()}
            </div>

            {/* 3. Single Fixed Horizontal Bottom Bar for ALL Controls - RESTORED CATEGORY BUTTONS */}
            <div
                className="fixed bottom-0 left-0 right-0 p-2 bg-blue-950/80 backdrop-blur-sm shadow-2xl z-30 flex items-center gap-2 overflow-x-auto whitespace-nowrap border-t border-amber-300/30"
                style={{ height: '4rem' }}
            >

                {/* Reset Map Button (Start of Bar) */}
                {map.current && (
                    <button
                        onClick={resetMapView}
                        className="bg-stone-800/80 hover:bg-stone-900 text-amber-300 font-serif py-1.5 px-4 rounded-full shadow-lg transition duration-300 border border-white/20 text-xs sm:text-sm flex-shrink-0"
                    >
                        Reset Map 🌍
                    </button>
                )}

                {/* NEW: Map Coordinates Display in the Bottom Bar */}
                <div className="hidden sm:flex text-amber-300/90 font-mono text-xs items-center p-1 px-2 bg-stone-900/50 rounded-full border border-amber-300/20 flex-shrink-0">
                    <span className="font-serif font-bold text-white mr-2">Map Center:</span>
                    <span className="mr-2">Lng: **{mapCenter.lng}**</span>
                    <span>Lat: **{mapCenter.lat}**</span>
                </div>

                {/* Data Acquisition Toggle Button (Now serving as 'Open Data Entry' button) */}
                <button
                    onClick={() => setIsCoordinateFormOpen(prev => !prev)}
                    className={`font-serif font-bold py-1.5 px-3 rounded-full shadow-lg transition duration-500 tracking-wider text-xs sm:text-sm flex-shrink-0
                        ${isCoordinateFormOpen
                            ? 'bg-amber-600 text-stone-900 border border-amber-300'
                            : collectedCoordinates.length > 0
                                ? 'bg-red-900 text-amber-300 border border-amber-300/50'
                                : 'bg-blue-900 hover:bg-blue-800 text-amber-300 border border-amber-300/50'
                        }`}
                >
                    {isCoordinateFormOpen ? 'Close Data Entry' : 'Open Data Entry'} ({collectedCoordinates.length} / {MAX_COLLECTED_POINTS})
                </button>

                {/* Clear Route/Points Button (Visibility based on state) */}
                {(routePoints.length > 0 || route) && (
                    <button
                        onClick={() => {
                            setRoutePoints([]);
                            dispatch(setRoute(null));
                            if (map.current?.getSource('route-source')) {
                                map.current.getSource('route-source').setData({ type: 'FeatureCollection', features: [] });
                            }
                        }}
                        className="bg-red-900/80 hover:bg-red-800 text-amber-300 font-serif py-1.5 px-3 rounded-full shadow-lg transition duration-300 border border-amber-300/50 text-xs sm:text-sm flex-shrink-0"
                    >
                        Clear Route
                    </button>
                )}

                {/* Separator / Visual Break */}
                <div className="border-l border-amber-300/50 h-6 mx-1 flex-shrink-0"></div>

                {/* Category Filters (The rest of the bar) - RESTORED */}
                {CATEGORY_OPTIONS.map(category => (
                    <button
                        key={category}
                        onClick={() => handleCategoryClick(category)}
                        className={`text-xs font-serif py-1 px-2 h-auto rounded-full transition duration-150 tracking-wide flex-shrink-0
                            ${activeCategory === category
                                ? 'bg-amber-600 text-stone-900 shadow-md border border-amber-300'
                                : 'bg-stone-900/50 text-amber-300/70 hover:bg-blue-900'}`
                        }
                    >
                        {category}
                    </button>
                ))}

            </div>

            {/* Info Panel UI (Building/Feature Info) */}
            {selectedFeature && (
                <InfoPanel
                    building={selectedFeature}
                    onRoute={handleRoute}
                    on360View={() => setView360Url(selectedFeature.imageURL)}
                    onCancel={handleCancelInfoPanel}
                />
            )}

            {/* 360 View Modal */}
            {view360Url && (
                <View360 imageUrl={view360Url} onClose={() => setView360Url(null)} />
            )}
        </>
    );
}

export default MapComponent;
import React, { useRef, useEffect, useCallback } from 'react';
import maplibregl from 'maplibre-gl';
import { useDispatch, useSelector } from 'react-redux';
import { fetchBuildings, setRoute, setError } from '../redux/mapSlice';
import axios from 'axios';
import InfoPanel from './InfoPanel';
import View360 from './View360';
// import DataEntryForm from './DataEntryForm'; // Kept commented

// --- CONFIGURATION CONSTANTS ---
// NOTE: Ensure you've addressed the 401 error with Stadia Maps API Key.
// The URL needs the API key appended if you want to use the map style.
const MAP_STYLE_URL = 'https://tiles.stadiamaps.com/styles/alidade_satellite.json';
const GOOGLE_EMBED_URL = 'https://maps.google.com/maps?q=Wolverhampton+WV10+9DS&z=15&output=embed';
const API_BASE_URL = 'https://ins-back-end.onrender.com/api/map'; // Express Backend
const DEFAULT_CENTER = { lng: 83.23, lat: 17.72, zoom: 14, pitch: 65 };

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
const PHOTO_MARKER_LAYER_ID = 'building-photo-markers';

// --- STYLING CONSTANTS (For better readability) ---
const COLOR_GOLD = '#d4af37'; // Default Feature color
const COLOR_PURPLE = '#9400d3'; // Filtered Feature color
const COLOR_ROUTE_GREEN = '#047857'; // Route line color


function MapComponent() {
    const mapContainer = useRef(null);
    const map = useRef(null);

    // State management
    const [mapCenter, setMapCenter] = React.useState({ lng: 83.21, lat: 17.72 });
    const [selectedFeature, setSelectedFeature] = React.useState(null);
    const [view360Url, setView360Url] = React.useState(null);
    const [activeCategory, setActiveCategory] = React.useState('All'); // Category filter state
    const [isCoordinateFormOpen, setIsCoordinateFormOpen] = React.useState(false);

    // Interaction States
    const [routePoints, setRoutePoints] = React.useState([]);
    const [loggedClicks, setLoggedClicks] = React.useState([]); // For general click logging
    const [collectedCoordinates, setCollectedCoordinates] = React.useState([]); // Right-click data collection

    // Redux Hooks
    const dispatch = useDispatch();
    const { buildings, route, loading, error } = useSelector((state) => state.map);

    // --- HANDLERS ---

    // Resets ONLY the collected coordinates
    const resetCollectedCoordinates = useCallback(() => {
        setCollectedCoordinates([]);
        // Optionally close form if it was reset to empty
        if (collectedCoordinates.length === 0) setIsCoordinateFormOpen(false);
    }, [collectedCoordinates.length]);

    // Handler to close the InfoPanel/Clear selected feature
    const handleCancelInfoPanel = useCallback(() => {
        setSelectedFeature(null);
        setView360Url(null); // Clear 360 view URL as well
    }, []);

    // Sets the active category filter
    const handleCategoryClick = (category) => {
        setActiveCategory(category);
    };

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
            setActiveCategory('All');

            // Clear map-drawn layers explicitly if they exist
            if (map.current.getSource(BOX_SOURCE_ID)) {
                map.current.getSource(BOX_SOURCE_ID).setData({ type: 'FeatureCollection', features: [] });
            }
        }
    }, [dispatch]);

    // --- ROUTING FUNCTIONALITY ---

    // Fetch buildings once on mount
    useEffect(() => {
        dispatch(fetchBuildings());
    }, [dispatch]);

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

    // Calculates and displays route between two predefined points (Used only inside useEffect currently)
    const calculateRouteBetweenPoints = useCallback(async (startPoint, endPoint) => {
        try {
            dispatch(setRoute(null));
            const response = await axios.post(`${API_BASE_URL}/route`, {
                startLng: startPoint.lng, startLat: startPoint.lat,
                endLng: endPoint.lng, endLat: endPoint.lat
            });
            dispatch(setRoute(response.data));
            map.current.flyTo({ center: [startPoint.lng, startPoint.lat], zoom: 15, essential: true });
            setRoutePoints([]); // Clear temporary route markers
        } catch (err) {
            console.error("Routing failed:", err);
            dispatch(setError("Routing failed. Check routing service connection."));
        }
    }, [dispatch]);


    // --- MAPLIBRE INITIALIZATION & EVENT HANDLERS ---
    useEffect(() => {
        if (map.current || !buildings) return; // Skip if already initialized or data is missing

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

            // Log all clicks
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

        // Handler 2: LEFT-CLICK (Feature Selection or Clearing)
        map.current.on('click', (e) => {
            if (e.originalEvent.button !== 0) return; // Only process left-click

            // Check if a point/marker/building feature was clicked
            const features = map.current.queryRenderedFeatures(e.point);
            const isFeatureClicked = features.some(f =>
                f.layer.id === BUILDING_LAYER_ID ||
                f.layer.id === 'viewpoint-markers' ||
                f.layer.id === PHOTO_MARKER_LAYER_ID
            );

            if (isFeatureClicked) {
                // Let the specific layer click handlers (below) manage the action
                return;
            }

            // Clear all states if empty space is clicked
            if (routePoints.length > 0 || route) {
                setRoutePoints([]);
                dispatch(setRoute(null));
            }

            // Clear selected feature/360 view if empty space is clicked
            setSelectedFeature(null);
            setView360Url(null);
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

            // Cleanup existing layers before adding new ones (Good practice)
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
                    // Prioritize dedicated viewpoint coordinates
                    if (feature.properties.viewpoint && feature.properties.viewpoint.coordinates) {
                        pointCoords = feature.properties.viewpoint.coordinates;
                    } else if (feature.geometry.coordinates && feature.geometry.coordinates.length > 0 && feature.geometry.type === 'Polygon') {
                        // Calculate center point of the polygon as fallback
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
            // 3D Buildings Layer
            map.current.addLayer({
                'id': BUILDING_LAYER_ID,
                'type': 'fill-extrusion',
                'source': 'buildings',
                'paint': {
                    'fill-extrusion-color': COLOR_GOLD, // Default Gold
                    'fill-extrusion-height': ['get', 'height'],
                    'fill-extrusion-base': 0,
                    'fill-extrusion-opacity': 1
                }
            });

            // Route points (start/end markers)
            map.current.addLayer({
                'id': ROUTE_POINT_LAYER_ID,
                'type': 'circle',
                'source': ROUTE_POINT_SOURCE_ID,
                'paint': {
                    // Match the color based on point index (0=Start, 1=End)
                    'circle-color': ['match', ['get', 'index'], 0, COLOR_ROUTE_GREEN, 1, '#b91c1c', '#333'],
                    'circle-radius': 10,
                    'circle-stroke-width': 2,
                    'circle-stroke-color': '#ffffff'
                }
            });

            // Drawn box (Polygon tool) - Assuming you only use drawnPolygonCoords now
            map.current.addLayer({
                'id': BOX_LAYER_ID,
                'type': 'fill',
                'source': BOX_SOURCE_ID,
                'layout': {},
                'paint': { 'fill-color': COLOR_GOLD, 'fill-opacity': 0.3, 'fill-outline-color': COLOR_GOLD }
            });

            // Logged clicks (gray)
            map.current.addLayer({
                'id': 'clicked-points-layer',
                'type': 'circle',
                'source': CLICKED_POINTS_SOURCE_ID,
                'paint': { 'circle-color': '#6b7280', 'circle-radius': 4, 'circle-stroke-width': 1, 'circle-stroke-color': '#ffffff' }
            });

            // --- 360 Photo Marker Logic (Symbol Layer) ---
            map.current.loadImage('/camera-icon.png', (error, image) => {
                if (!error && !map.current.hasImage('camera-icon')) {
                    map.current.addImage('camera-icon', image, { pixelRatio: 2 });

                    map.current.addLayer({
                        'id': PHOTO_MARKER_LAYER_ID,
                        'type': 'symbol',
                        'source': 'viewpoint-source',
                        'layout': {
                            'icon-image': 'camera-icon',
                            'icon-size': 0.12,
                            // Only visible if imageURL property exists
                            'visibility': ['case', ['has', 'imageURL'], 'visible', 'none']
                        },
                        'filter': ['has', 'imageURL']
                    });
                }
            });

            // --- Feature Click Handlers ---

            // 1. Building Click (Left-Click)
            map.current.on('click', BUILDING_LAYER_ID, (e) => {
                const feature = e.features[0];
                const coords = feature.geometry.coordinates[0];
                // Calculate polygon center for InfoPanel display
                const centerLng = coords.reduce((sum, p) => sum + p[0], 0) / coords.length;
                const centerLat = coords.reduce((sum, p) => sum + p[1], 0) / coords.length;

                setSelectedFeature({
                    name: feature.properties.name,
                    id: feature.properties.id,
                    imageURL: feature.properties.imageURL,
                    category: feature.properties.category,
                    centerPoint: { lng: centerLng, lat: centerLat }
                });
                map.current.flyTo({ center: [centerLng, centerLat], pitch: 60, zoom: 16 });
            });

            // 2. 360 View Marker Click (Left-Click)
            map.current.on('click', PHOTO_MARKER_LAYER_ID, (e) => {
                const feature = e.features[0];
                setSelectedFeature({
                    name: feature.properties.name,
                    id: feature.properties.id,
                    imageURL: feature.properties.imageURL,
                    category: feature.properties.category,
                    centerPoint: { lng: feature.geometry.coordinates[0], lat: feature.geometry.coordinates[1] }
                });

                if (feature.properties.imageURL) { setView360Url(feature.properties.imageURL); }
                map.current.flyTo({ center: feature.geometry.coordinates, pitch: 60, zoom: 16 });
            });
        });

        // Cleanup on component unmount
        return () => {
            map.current?.remove();
            map.current = null;
        };
    }, [buildings, dispatch]);


    // --- EFFECT: CATEGORY FILTERING AND COLORING LOGIC ---
    useEffect(() => {
        if (!map.current || !map.current.isStyleLoaded()) return;

        // 1. Determine Color
        const extrusionColor = activeCategory === 'All' ? COLOR_GOLD : COLOR_PURPLE;

        // 2. Apply Filter and Color to 3D Buildings
        if (map.current.getLayer(BUILDING_LAYER_ID)) {
            map.current.setPaintProperty(BUILDING_LAYER_ID, 'fill-extrusion-color', extrusionColor);

            if (activeCategory === 'All') {
                map.current.setFilter(BUILDING_LAYER_ID, null);
            } else {
                map.current.setFilter(BUILDING_LAYER_ID, ['==', ['get', 'category'], activeCategory]);
            }
        }

        // 3. Apply Filter to Photo Markers
        if (map.current.getLayer(PHOTO_MARKER_LAYER_ID)) {
            if (activeCategory === 'All') {
                map.current.setFilter(PHOTO_MARKER_LAYER_ID, ['has', 'imageURL']);
            } else {
                map.current.setFilter(PHOTO_MARKER_LAYER_ID, ['all', ['has', 'imageURL'], ['==', ['get', 'category'], activeCategory]]);
            }
        }
    }, [activeCategory]);

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
                    'id': routeLayerId,
                    'type': 'line',
                    'source': routeSourceId,
                    'layout': { 'line-join': 'round', 'line-cap': 'round' },
                    'paint': {
                        'line-color': COLOR_ROUTE_GREEN,
                        'line-width': 6,
                        'line-dasharray': [2, 1]
                    }
                });
            }
        } else if (!route && sourceExists) {
            // Clear the route line if route is null
            map.current.getSource(routeSourceId).setData({ type: 'FeatureCollection', features: [] });
        }
    }, [route]);

    // --- EFFECT: ROUTE POINT RENDERING ---
    useEffect(() => {
        if (!map.current || !map.current.isStyleLoaded()) return;

        const routeGeoJSON = {
            type: 'FeatureCollection',
            features: routePoints.map((point, index) => ({
                type: 'Feature',
                geometry: { type: 'Point', coordinates: [point.lng, point.lat] },
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

        // Ensure the source and layer exist
        if (!map.current.getSource(COLLECTED_COORDS_SOURCE_ID)) {
            map.current.addSource(COLLECTED_COORDS_SOURCE_ID, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
            map.current.addLayer({
                'id': COLLECTED_COORDS_LAYER_ID,
                'type': 'circle',
                'source': COLLECTED_COORDS_SOURCE_ID,
                'paint': {
                    'circle-color': COLOR_GOLD,
                    'circle-radius': 7,
                    'circle-stroke-width': 2,
                    'circle-stroke-color': '#ffffff'
                }
            });
        }

        const features = collectedCoordinates.map(point => ({
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [parseFloat(point.lng), parseFloat(point.lat)] },
            properties: {}
        }));

        map.current.getSource(COLLECTED_COORDS_SOURCE_ID).setData({ type: 'FeatureCollection', features });

    }, [collectedCoordinates]);


    // --- RENDER HELPERS ---

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
                {/* The Google Embed logic was removed as it was always false and cluttered the main useEffect dependency array. */}
                <div ref={mapContainer} className="w-full h-full" />
            </div>

            {/* Open/Close Coordinate Form Button (Top Left) */}
            <button
                onClick={() => setIsCoordinateFormOpen(prev => !prev)}
                className="absolute top-4 left-4 bg-blue-950 hover:bg-amber-600 text-amber-300 font-serif font-bold py-2 px-6 rounded-full shadow-2xl z-20 transition duration-500 tracking-wider border border-amber-300/50"
            >
                {isCoordinateFormOpen ? 'Close Data Acquisition' : 'Open Data Acquisition'}
            </button>

            {/* Reset Map View Button (Bottom Right) */}
            {map.current && (
                <button
                    onClick={resetMapView}
                    className="absolute bottom-4 right-4 bg-stone-800/80 hover:bg-stone-900 text-amber-300 font-serif py-2 px-6 rounded-full shadow-2xl z-20 transition duration-300 border border-white/20"
                >
                    Reset Map View 🌍
                </button>
            )}

            {/* Clear All Map Interaction Button (Bottom Right - Shifted left) */}
            {(routePoints.length > 0 || route) && (
                <button
                    onClick={() => {
                        setRoutePoints([]);
                        dispatch(setRoute(null));
                        // Clear the route line from map source if it exists
                        if (map.current.getSource('route-source')) {
                            map.current.getSource('route-source').setData({ type: 'FeatureCollection', features: [] });
                        }
                    }}
                    // Adjusted position to be left of the Reset Map View button
                    className="absolute bottom-4 right-52 bg-red-900/80 hover:bg-red-800 text-amber-300 font-serif py-2 px-4 rounded-full shadow-2xl z-20 transition duration-300 border border-amber-300/50"
                >
                    Clear Route/Points
                </button>
            )}

            {/* CATEGORY FILTER BUTTONS (Bottom Center) */}
            <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 bg-blue-950/70 backdrop-blur-sm p-2 rounded-xl shadow-2xl z-10 flex space-x-2 border border-amber-300/30">
                {CATEGORY_OPTIONS.map(category => (
                    <button
                        key={category}
                        onClick={() => handleCategoryClick(category)}
                        className={`text-xs font-serif py-1 px-4 h-15 rounded-full transition duration-150 tracking-wide
                            ${activeCategory === category
                                ? 'bg-amber-600 text-stone-900 shadow-md border border-amber-300' // Selected: Gold/Amber
                                : 'bg-stone-900/50 text-amber-300/70 hover:bg-blue-900'}` // Default: Dark/Transparent
                        }
                    >
                        {category}
                    </button>
                ))}
            </div>

            {/* Coordinate Display & Status Overlay (Top Right) */}
            <div className="absolute top-4 right-4 bg-stone-950/70 backdrop-blur-sm p-4 rounded-xl shadow-2xl z-10 text-base font-mono text-amber-300 border border-amber-300/30" style={{ maxWidth: '300px' }}>
                <p className="text-lg font-serif tracking-widest text-white mb-2">Imperial Map Console</p>
                <p className="text-amber-300/90"><span className="text-gray-500">Longitude:</span> **{mapCenter.lng}**</p>
                <p className="text-amber-300/90"><span className="text-gray-500">Latitude:</span> **{mapCenter.lat}**</p>

                {getCollectedCoordsDisplay()}
                {getAllClickedCoordsDisplay()}
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
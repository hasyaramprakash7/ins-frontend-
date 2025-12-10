// View360.jsx

import React, { useEffect, useRef } from 'react';

// CRITICAL FIX: Access Pannellum via the global window object because it's loaded via a script tag.
const pannellum = window.pannellum;

/**
 * Component that displays a 360-degree panoramic image using Pannellum.
 * Designed as a full-screen, immersive modal.
 */
const View360 = ({ imageUrl, onClose }) => {
    const viewerRef = useRef(null);

    useEffect(() => {
        // 1. Check if the viewer library (Pannellum) is available
        if (viewerRef.current && imageUrl && pannellum && pannellum.viewer) {

            // 2. Construct the full absolute image URL using the Express server address
            const fullImageUrl = imageUrl.startsWith('https') ? imageUrl : `https://ins-back-end.onrender.com${imageUrl}`;

            // CRUCIAL DEBUG LOG: Check this in your browser console!
            console.log("Pannellum Initialization Started.");
            console.log("Loading 360 image from absolute URL:", fullImageUrl);

            // 3. Initialize the Pannellum viewer instance.
            try {
                // To avoid initialization errors, we check if the image URL is valid before calling viewer.
                // However, Pannellum handles the fetch, so we proceed with robust logging.
                pannellum.viewer(viewerRef.current, {
                    type: "equirectangular",
                    panorama: fullImageUrl, // Use the fully qualified URL
                    autoLoad: true,
                    autoRotate: -2,
                    showFullscreenCtrl: false,
                    pitch: -10,
                    hfov: 100,
                    keyboardZoom: 'off',
                    mouseZoom: false
                });
            } catch (error) {
                console.error("Pannellum failed to initialize viewer. Check if the container is visible and the image is a valid equirectangular 360 photo.", error);
            }

        } else {
            console.warn("View360 initialization waiting: Missing container, imageUrl, or Pannellum global object.");
        }

        // Cleanup function
        return () => {
            // Clears the container when the modal is closed to prevent Pannellum memory leaks
            if (viewerRef.current) {
                viewerRef.current.innerHTML = '';
            }
        };
    }, [imageUrl]);

    return (
        // Tailwind for a fixed, full-screen overlay (z-50 is max to ensure it's on top)
        <div className="fixed inset-0 bg-black z-50 flex items-center justify-center">

            {/* Viewer container - Maximized to w-full h-full. */}
            <div
                ref={viewerRef}
                className="w-full h-full shadow-2xl overflow-hidden"
                style={{ position: 'relative' }}
            >
                {/* Fallback/Loading indicator */}
                {!pannellum && (
                    <div className="absolute inset-0 flex items-center justify-center bg-gray-800 text-white text-xl">
                        Loading 360 Viewer Library...
                    </div>
                )}
            </div>

            {/* Close button */}
            <button
                onClick={onClose}
                className="absolute top-6 right-6 text-white text-3xl font-bold bg-red-700 p-2 rounded-full w-12 h-12 
                                 flex items-center justify-center hover:bg-red-800 transition duration-150 shadow-xl 
                                 border-2 border-white/50 z-[51]"
                aria-label="Close 360 Viewer"
            >
                ×
            </button>
        </div>
    );
};

export default View360;
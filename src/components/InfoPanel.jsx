import React from 'react';
// This component displays information about a clicked building and provides action buttons.

// ADDED 'onCancel' to the destructured props
const InfoPanel = ({ building, onRoute, on360View, onCancel }) => {
    // Placeholder coordinates for demonstrating routing functionality. 
    // In a production app, these would come from the 'viewpoint' field in your MongoDB.
    const destinationCoords = { lng: 78.615, lat: 13.275 };

    const handleRouteClick = () => {
        onRoute(destinationCoords);
    };

    return (
        // z-10 ensures it's above the map but below the DataEntryForm (z-20)
        <div className="absolute top-4 right-4 bg-white p-4 rounded-xl shadow-2xl z-10 w-64 border border-gray-200">
            {/* CANCEL BUTTON: Added close button icon in the top right of the panel */}
            <button
                onClick={onCancel}
                className="absolute top-2 right-2 p-1 text-gray-500 hover:text-gray-800 rounded-full hover:bg-gray-100 transition duration-150"
                aria-label="Close"
            >
                {/* Simple 'X' icon for closing */}
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path>
                </svg>
            </button>

            <h4 className="text-xl font-bold text-gray-800 mb-2">{building.name || "Selected Building"}</h4>

            {/* Displaying the category if available */}
            {building.category && (
                <p className="text-sm text-indigo-600 font-semibold">Category: {building.category}</p>
            )}

            <p className="text-sm text-gray-600">
                Building ID: {building.id}
            </p>
           

            <hr className="my-3 border-gray-200" />

            {/* Action Buttons Container */}
            <div className="flex flex-col space-y-2">
                {/* Navigation Button: Calls handleRouteClick */}
                {/* <button
                    onClick={handleRouteClick}
                    className="w-full bg-blue-600 hover:bg-blue-700 text-black font-semibold py-2 px-3 rounded-lg text-sm transition duration-150 shadow-md"
                >
                    Start Navigation ➡️
                </button> */}

                {/* 360° View Button: Calls on360View */}
                <button
                    onClick={on360View}
                    disabled={!building.imageURL}
                    className={`w-full font-semibold py-2 px-3 rounded-lg text-sm transition duration-150 shadow-md ${building.imageURL
                        ? 'bg-green-600 hover:bg-green-700 text-black'
                        : 'bg-gray-400 text-gray-700 cursor-not-allowed'
                        }`}
                >
                    View 360° 📷
                </button>
            </div>
        </div>
    );
};

export default InfoPanel;
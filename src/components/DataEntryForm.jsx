import React, { useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { saveNewBuilding, clearSubmitStatus, setLoading } from '../redux/mapSlice';
import axios from 'axios';

const DataEntryForm = () => {
    const dispatch = useDispatch();
    const submitStatus = useSelector((state) => state.map.submitStatus);

    // Express API base URL
    const API_UPLOAD_URL = 'https://ins-back-end.onrender.com/api/map/upload';

    const [imagePath, setImagePath] = useState('');
    const [isDragActive, setIsDragActive] = useState(false);
    const [formData, setFormData] = useState({
        name: 'New Building',
        category: 'Building',
        height: 40,
        // The default is a closed polygon, but this is a starting template.
        coordinates: `[[
    [83.2839, 17.6829],
    [83.2841, 17.6829],
    [83.2841, 17.6831],
    [83.2839, 17.6831],
    [83.2839, 17.6829] 
]]`,
    });

    // List of allowed categories from the Mongoose schema enum
    const CATEGORY_OPTIONS = ['Building', 'Cabin', 'Security Pillar', 'Gate', 'Other', "main"];

    const handleChange = (e) => {
        dispatch(clearSubmitStatus());
        setFormData({ ...formData, [e.target.name]: e.target.value });
    };

    // --- DRAG-AND-DROP LOGIC (Unchanged) ---
    const handleDrag = (e) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragActive(e.type === "dragenter" || e.type === "dragover");
    };

    const handleDrop = async (e) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragActive(false);

        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            await uploadFile(e.dataTransfer.files[0]);
        }
    };

    // --- FILE UPLOAD LOGIC (Unchanged) ---
    const uploadFile = async (file) => {
        dispatch(clearSubmitStatus());
        dispatch(setLoading(true));
        const form = new FormData();
        form.append('360Image', file);

        try {
            const response = await axios.post(API_UPLOAD_URL, form, {
                headers: { 'Content-Type': 'multipart/form-data' },
            });
            setImagePath(response.data.filePath);
            dispatch(setLoading(false));
            dispatch(saveNewBuilding.fulfilled({ msg: 'Image uploaded! Ready to save data.' }, 'upload_success'));
        } catch (error) {
            dispatch(setLoading(false));
            dispatch(saveNewBuilding.rejected({ payload: 'Error uploading file: ' + (error.response?.data?.msg || error.message) }, 'upload_error'));
        }
    };

    // --- FORM SUBMISSION (MODIFIED to close polygon) ---
    const handleSubmit = async (e) => {
        e.preventDefault();
        dispatch(clearSubmitStatus());

        if (!imagePath) {
            dispatch(saveNewBuilding.rejected({ payload: 'Please upload the 360 image first.' }, 'submit_error'));
            return;
        }

        let parsedCoordinates;
        try {
            parsedCoordinates = JSON.parse(formData.coordinates);
        } catch (err) {
            dispatch(saveNewBuilding.rejected({ payload: 'Invalid GeoJSON coordinates format.' }, 'submit_error'));
            return;
        }

        // --- CRITICAL MODIFICATION: Auto-Close Polygon ---
        if (parsedCoordinates.length > 0 && parsedCoordinates[0].length >= 3) {
            const linearRing = parsedCoordinates[0];
            const firstPoint = linearRing[0];
            const lastPoint = linearRing[linearRing.length - 1];

            // Deep comparison to check if the polygon is already closed
            if (firstPoint[0] !== lastPoint[0] || firstPoint[1] !== lastPoint[1]) {
                // If the first and last points are NOT equal, add the first point to the end.
                linearRing.push(firstPoint);
                // Update the coordinates structure (parsedCoordinates is already a reference)
                parsedCoordinates[0] = linearRing;
                console.log("Polygon automatically closed.");
            }
        }
        // --- END CRITICAL MODIFICATION ---

        // Final data payload for Mongoose
        const payload = {
            name: formData.name,
            category: formData.category,
            buildingInfo: { height: parseFloat(formData.height) },
            location: {
                type: 'Polygon',
                coordinates: parsedCoordinates // Use the safely parsed and closed coordinates
            },
            imageURL: imagePath,
        };

        // Dispatch the Redux Thunk to save the data
        dispatch(saveNewBuilding(payload));

        // Reset form fields after successful dispatch
        setImagePath('');
        setFormData({ ...formData, name: 'New Building', category: 'Building', height: 40, coordinates: '[[[78.61, 13.27], [78.615, 13.27], [78.615, 13.275], [78.61, 13.275], [78.61, 13.27]]]' });
    };

    return (
        <form onSubmit={handleSubmit}
            className="absolute top-4 left-4 p-4 bg-white shadow-2xl rounded-xl max-w-sm border border-gray-200 z-20">
            <h2 className="text-xl font-bold text-indigo-700 mb-4">Add New Location Data</h2>

            {/* Name Field (Unchanged) */}
            <div className="mb-3">
                <label className="block text-sm font-medium text-gray-700">Name</label>
                <input type="text" name="name" value={formData.name} onChange={handleChange}
                    className="mt-1 block w-full border border-gray-300 rounded-lg shadow-sm p-2 text-sm" required />
            </div>

            {/* Category Field (Unchanged) */}
            <div className="mb-3">
                <label className="block text-sm font-medium text-gray-700">Category</label>
                <select name="category" value={formData.category} onChange={handleChange}
                    className="mt-1 block w-full border border-gray-300 rounded-lg shadow-sm p-2 text-sm bg-white" required>
                    {CATEGORY_OPTIONS.map(cat => (
                        <option key={cat} value={cat}>{cat}</option>
                    ))}
                </select>
            </div>

            {/* Height Field (Unchanged) */}
            <div className="mb-3">
                <label className="block text-sm font-medium text-gray-700">Height (for 3D extrusion)</label>
                <input type="number" name="height" value={formData.height} onChange={handleChange}
                    className="mt-1 block w-full border border-gray-300 rounded-lg shadow-sm p-2 text-sm" required />
            </div>

            {/* GeoJSON Polygon Array (Unchanged) */}
            <div className="mb-3">
                <label className="block text-sm font-medium text-gray-700">GeoJSON Polygon Array</label>
                <textarea name="coordinates" value={formData.coordinates} onChange={handleChange} rows="3"
                    className="mt-1 block w-full border border-gray-300 rounded-lg shadow-sm p-2 text-xs font-mono" />
                <p className='text-xs text-gray-500 mt-1'>
                    Note: The system will automatically close the polygon (repeat the first coordinate at the end).
                </p>
            </div>

            {/* Drag and Drop Area (Unchanged) */}
            <div
                className={`border-2 border-dashed rounded-lg p-4 text-center transition duration-200 
                             ${isDragActive ? 'bg-indigo-100 border-indigo-500' : 'bg-gray-50 border-gray-300'}`}
                onDragEnter={handleDrag} onDragLeave={handleDrag} onDragOver={handleDrag} onDrop={handleDrop}
            >
                <p className="text-sm text-gray-700 font-medium">
                    {isDragActive ? 'Drop the file here...' : 'Drag & Drop 360° Image (.jpg, .png)'}
                </p>
                {imagePath && (
                    <p className="text-green-600 mt-2 text-xs font-semibold truncate">
                        ✅ Uploaded: {imagePath.split('/').pop()}
                    </p>
                )}
            </div>

            {/* Submit Button (Unchanged) */}
            <button type="submit"
                disabled={!imagePath || submitStatus === 'Saving...'}
                className={`w-full font-bold py-2 rounded-lg shadow-md transition duration-150 mt-4 
                             ${imagePath ? 'bg-indigo-600 hover:bg-indigo-700 text-white' : 'bg-gray-400 text-gray-700 cursor-not-allowed'}`}>
                {submitStatus === 'Saving...' ? 'Saving...' : 'Save Building Data to Map'}
            </button>
            <p className={`mt-2 text-sm text-center font-medium ${submitStatus?.startsWith('Error') ? 'text-red-600' : 'text-green-600'}`}>{submitStatus}</p>
        </form>
    );
};

export default DataEntryForm;
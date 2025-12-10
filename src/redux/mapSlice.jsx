import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import axios from 'axios';

// --- CONFIGURATION CONSTANTS ---
const API_BASE_URL = 'https://ins-back-end.onrender.com/api/map'; // Express Backend URL

// 1. ASYNC THUNK: Function to fetch buildings data
export const fetchBuildings = createAsyncThunk(
    'map/fetchBuildings',
    async (_, { rejectWithValue }) => {
        try {
            const response = await axios.get(`${API_BASE_URL}/buildings`);
            return response.data;
        } catch (error) {
            console.error("API Error fetching buildings:", error);
            return rejectWithValue("Failed to load map data. Check Express Server and MongoDB connection.");
        }
    }
);

// 2. ASYNC THUNK: Function to save new building data
export const saveNewBuilding = createAsyncThunk(
    'map/saveNewBuilding',
    async (buildingData, { rejectWithValue, dispatch }) => {
        try {
            const response = await axios.post(`${API_BASE_URL}/new`, buildingData);
            dispatch(fetchBuildings());
            return response.data;
        } catch (error) {
            // Extract the custom error message from the 400 response
            console.error("API Error saving building:", error.response?.data?.msg || error.message);
            return rejectWithValue(error.response?.data?.msg || "Failed to save building data.");
        }
    }
);

// Define the initial state structure for map data
const initialState = {
    buildings: null,
    route: null,
    loading: false,
    error: null,
    submitStatus: null,
};

export const mapSlice = createSlice({
    name: 'map',
    initialState,
    reducers: {
        setRoute: (state, action) => { state.route = action.payload; },
        clearRoute: (state) => { state.route = null; },
        clearSubmitStatus: (state) => { state.submitStatus = null; },
        setError: (state, action) => { state.error = action.payload; state.loading = false; },
        setLoading: (state, action) => { state.loading = action.payload; },
    },
    extraReducers: (builder) => {
        builder
            // --- fetchBuildings lifecycle ---
            .addCase(fetchBuildings.pending, (state) => { state.loading = true; state.error = null; })
            .addCase(fetchBuildings.fulfilled, (state, action) => { state.loading = false; state.buildings = action.payload; })
            .addCase(fetchBuildings.rejected, (state, action) => { state.loading = false; state.error = action.payload || "Unknown error occurred during fetch."; })

            // --- saveNewBuilding lifecycle ---
            .addCase(saveNewBuilding.pending, (state) => { state.submitStatus = 'Saving...'; })
            .addCase(saveNewBuilding.fulfilled, (state, action) => { state.submitStatus = action.payload.msg || 'Data saved and map refreshing!'; })
            .addCase(saveNewBuilding.rejected, (state, action) => { state.submitStatus = `Error: ${action.payload}`; });
    },
});

export const { setRoute, clearRoute, clearSubmitStatus, setError, setLoading } = mapSlice.actions;

export default mapSlice.reducer;
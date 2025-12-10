import { configureStore } from '@reduxjs/toolkit';
import mapReducer from './mapSlice';

// A simple Redux store configuration using RTK's configureStore
export const store = configureStore({
  reducer: {
    map: mapReducer, // The map slice reducer handles all map-related state
  },
  // Required middleware setup for serializable check when dealing with large GeoJSON objects
  middleware: (getDefaultMiddleware) => getDefaultMiddleware({
    serializableCheck: {
      ignoredActions: ['map/fetchBuildings/fulfilled'], // Ignore serialization check on fetchBuildings fulfilled action
      ignoredPaths: ['map.buildings', 'map.route'], // Ignore serialization check for large GeoJSON data structures
    },
  }),
});

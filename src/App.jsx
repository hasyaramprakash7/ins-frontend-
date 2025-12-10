import React, { useState } from 'react'; // 1. Import useState
import MapComponent from './components/MapComponent';
import DataEntryForm from './components/DataEntryForm';
import { Provider } from 'react-redux';
import { store } from './redux/store';

function App() {
  // 2. Initialize state to control the visibility of the DataEntryForm
  const [isFormOpen, setIsFormOpen] = useState(false);

  // 3. Handler function to toggle the form's visibility
  const toggleForm = () => {
    setIsFormOpen(prev => !prev);
  };

  return (
    // Wrap the entire application with the Redux Provider
    <Provider store={store}>
      <div className="w-screen h-screen relative">
        {/* MapComponent takes up the full background */}
        <MapComponent />

        {/* 4. Button to open/close the DataEntryForm */}
        <button
          onClick={toggleForm}
          className="absolute top-4 left-68 z-30 p-3 bg-blue-500 text-black rounded shadow-lg hover:bg-blue-600 transition-colors"
        // You might need to adjust the Tailwind CSS classes (e.g., z-index, position)
        >
          {isFormOpen ? 'Close Data Entry' : 'Open Data Entry'}
        </button>

        {/* 5. Conditionally render the DataEntryForm */}
        {isFormOpen && (
          // DataEntryForm floats over the map for easy input (z-20 ensures it's above InfoPanel's z-10)
          <DataEntryForm />
        )}
      </div>
    </Provider>
  );
}

export default App;
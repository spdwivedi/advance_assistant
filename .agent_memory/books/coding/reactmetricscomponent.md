

## Operation Insight [2026-08-06 11:01:23]
```
import React, { useState, useEffect } from 'react';
import axios from 'axios';

function Metrics() {
  const [metrics, setMetrics] = useState(null);

  useEffect(() => {
    axios.get('/api/metrics')
      .then(response => setMetrics(response.data))
      .catch(error => console.error('Error fetching metrics:', error));
  }, []);

  return (
    <div className="bg-gray-100 h-screen flex items-center justify-center">
      {metrics ? (<pre>{JSON.stringify(metrics, null, 2)}</pre>) : (<h1>Loading...</h1>)}
    </div>
  );
}

export default Metrics;
```
The provided code snippet is a React component named `Metrics` that fetches metrics data from an API and displays it. It uses the `useState` hook to manage the state of the metrics data and the `useEffect` hook to perform the data fetching when the component mounts. If the metrics data is available, it renders the data in a pre-formatted text block; otherwise, it displays 'Loading...' while the data is being fetched.
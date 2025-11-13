/**
 * SWR Fetcher Utility
 *
 * Generic fetcher function for SWR that handles common fetch patterns
 * with error handling and type safety.
 */

/**
 * Extended Error type with additional properties
 */
interface FetchError extends Error {
  info?: unknown;
  status?: number;
}

/**
 * Default fetcher for SWR using the Fetch API
 * @param url - The API endpoint to fetch from
 * @returns Parsed JSON response
 * @throws FetchError if the response is not ok
 */
export async function fetcher<T = unknown>(url: string): Promise<T> {
  const response = await fetch(url);

  if (!response.ok) {
    const error: FetchError = new Error(
      'An error occurred while fetching the data.',
    );
    // Attach extra info to the error object
    try {
      error.info = await response.json();
    } catch {
      error.info = null;
    }
    error.status = response.status;
    throw error;
  }

  return response.json();
}

/**
 * Fetcher with authentication token
 * @param url - The API endpoint to fetch from
 * @param token - Authentication token
 * @returns Parsed JSON response
 */
export async function fetcherWithAuth<T = unknown>(
  url: string,
  token: string,
): Promise<T> {
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    const error: FetchError = new Error(
      'An error occurred while fetching the data.',
    );
    try {
      error.info = await response.json();
    } catch {
      error.info = null;
    }
    error.status = response.status;
    throw error;
  }

  return response.json();
}

/**
 * Fetcher for POST requests
 * @param url - The API endpoint
 * @param data - The data to send
 * @returns Parsed JSON response
 */
export async function fetcherPost<T = unknown, D = unknown>(
  url: string,
  data: D,
): Promise<T> {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const error: FetchError = new Error(
      'An error occurred while posting the data.',
    );
    try {
      error.info = await response.json();
    } catch {
      error.info = null;
    }
    error.status = response.status;
    throw error;
  }

  return response.json();
}

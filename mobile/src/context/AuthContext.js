import React, { createContext, useState, useEffect, useContext } from 'react';
import * as SecureStore from '../utils/storage';
import { authAPI, setAuthFailureHandler } from '../api/client';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(true);

  // Load stored auth data on mount
  useEffect(() => {
    loadStoredAuth();
  }, []);

  // When a token refresh fails (refresh token expired/revoked), the API client
  // clears storage and calls this so the UI drops back to the login screen.
  useEffect(() => {
    setAuthFailureHandler(() => {
      setToken(null);
      setUser(null);
    });
    return () => setAuthFailureHandler(null);
  }, []);

  async function loadStoredAuth() {
    try {
      const storedToken = await SecureStore.getItemAsync('authToken');
      const storedUser = await SecureStore.getItemAsync('userData');

      if (storedToken && storedUser) {
        setToken(storedToken);
        setUser(JSON.parse(storedUser));
      }
    } catch (error) {
      console.log('Load stored auth error:', error);
    } finally {
      setLoading(false);
    }
  }

  async function login(email, password) {
    try {
      const response = await authAPI.login({ email, password });
      const { token: newToken, refreshToken, user: userData } = response.data;

      await SecureStore.setItemAsync('authToken', newToken);
      if (refreshToken) await SecureStore.setItemAsync('refreshToken', refreshToken);
      await SecureStore.setItemAsync('userData', JSON.stringify(userData));

      setToken(newToken);
      setUser(userData);

      return userData;
    } catch (error) {
      // Re-throw with better error message
      const errorMessage = error.response?.data?.errors?.[0] || error.message || 'Login failed. Please try again.';
      const customError = new Error(errorMessage);
      customError.response = error.response;
      throw customError;
    }
  }

  async function register(data) {
    try {
      const response = await authAPI.register(data);
      
      // After successful registration, automatically log the user in
      if (response.data.message) {
        // Registration successful, now login
        try {
          const loginResponse = await authAPI.login({
            email: data.email,
            password: data.password
          });
          const { token: newToken, refreshToken, user: userData } = loginResponse.data;

          await SecureStore.setItemAsync('authToken', newToken);
          if (refreshToken) await SecureStore.setItemAsync('refreshToken', refreshToken);
          await SecureStore.setItemAsync('userData', JSON.stringify(userData));

          setToken(newToken);
          setUser(userData);

          return { ...response.data, user: userData, token: newToken };
        } catch (loginError) {
          // Registration succeeded but auto-login failed
          // Return success message but user needs to login manually
          return response.data;
        }
      }
      
      return response.data;
    } catch (error) {
      // Re-throw with better error message
      const errorMessage = error.response?.data?.errors?.[0] || error.message || 'Registration failed. Please try again.';
      const customError = new Error(errorMessage);
      customError.response = error.response;
      throw customError;
    }
  }

  async function forgotPassword(email) {
    const response = await authAPI.forgotPassword({ email });
    return response.data;
  }

  async function logout() {
    // Best-effort server-side revocation of the refresh token.
    try {
      const refreshToken = await SecureStore.getItemAsync('refreshToken');
      if (refreshToken) await authAPI.logout(refreshToken);
    } catch (e) { /* ignore — clear locally regardless */ }

    await SecureStore.deleteItemAsync('authToken');
    await SecureStore.deleteItemAsync('refreshToken');
    await SecureStore.deleteItemAsync('userData');
    setToken(null);
    setUser(null);
  }

  async function updateUser(userData) {
    setUser(userData);
    await SecureStore.setItemAsync('userData', JSON.stringify(userData));
  }

  const value = {
    user,
    token,
    loading,
    login,
    register,
    forgotPassword,
    logout,
    updateUser,
    isLoggedIn: !!token,
    isUser: user?.userType === 'user',
    isProvider: user?.userType === 'provider',
    isAdmin: user?.userType === 'admin',
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

export default AuthContext;

import React, { createContext, useContext, useState, useEffect } from 'react';
import axios from 'axios';

const AuthContext = createContext(null);

export function useAuth() {
  return useContext(AuthContext);
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // Axios interceptor: vsem zahtevkom doda Bearer token
  useEffect(() => {
    const reqInterceptor = axios.interceptors.request.use((config) => {
      const token = localStorage.getItem('token');
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
      return config;
    });

    const resInterceptor = axios.interceptors.response.use(
      (r) => r,
      (err) => {
        if (err.response?.status === 401) {
          // Token poteklo ali neveljaven → logout
          localStorage.removeItem('token');
          setUser(null);
        }
        return Promise.reject(err);
      }
    );

    return () => {
      axios.interceptors.request.eject(reqInterceptor);
      axios.interceptors.response.eject(resInterceptor);
    };
  }, []);

  // Ob loadu preveri obstoječi token
  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) {
      setLoading(false);
      return;
    }
    // Token pripnemo eksplicitno, da ne čakamo na interceptor
    axios.get('http://localhost:8000/api/auth/me', {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(res => setUser(res.data))
      .catch(() => {
        localStorage.removeItem('token');
      })
      .finally(() => setLoading(false));
  }, []);

  async function login(email, password) {
    const res = await axios.post('http://localhost:8000/api/auth/login', {
      email, password
    });
    if (res.data.error) {
      throw new Error(res.data.error);
    }
    localStorage.setItem('token', res.data.access_token);
    setUser(res.data.user);
    return res.data.user;
  }

  async function register(email, password, fullName) {
    const res = await axios.post('http://localhost:8000/api/auth/register', {
      email, password, full_name: fullName
    });
    if (res.data.error) {
      throw new Error(res.data.error);
    }
    localStorage.setItem('token', res.data.access_token);
    setUser(res.data.user);
    return res.data.user;
  }

  function logout() {
    localStorage.removeItem('token');
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

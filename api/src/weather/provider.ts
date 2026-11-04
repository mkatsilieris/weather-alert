import { config } from '../config.js';
import type { LatLon } from '../lib/geo.js';
import type { RainCell } from '../lib/approach.js';
import { openMeteoProvider } from './open-meteo.js';
import { openWeatherMapProvider } from './openweathermap.js';
import { mockProvider } from './mock.js';

/**
 * Where the current conditions of the grid points come from. A provider answers one question per
 * point: how much does it rain there right now, and which way (and how fast) is that rain moving.
 */
export interface ObservationProvider {
  name: string;
  observe(points: LatLon[]): Promise<RainCell[]>;
}

export function createProvider(): ObservationProvider {
  switch (config.scan.provider) {
    case 'openweathermap':
      if (!config.scan.owmApiKey) throw new Error('WEATHER_PROVIDER=openweathermap needs OWM_API_KEY');
      return openWeatherMapProvider;
    case 'open-meteo':
      return openMeteoProvider;
    case 'mock':
      return mockProvider;
    default:
      throw new Error(`Unknown WEATHER_PROVIDER "${config.scan.provider}" (open-meteo | openweathermap | mock)`);
  }
}

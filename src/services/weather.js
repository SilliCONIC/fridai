import { $, logLine } from '../utils/dom.js';
import { jalaliString } from '../utils/datetime.js';
import { state } from '../state.js';

export async function refreshCity() {
    if (!state.city) return;
    try {
        const url = new URL("https://api.open-meteo.com/v1/forecast");
        url.searchParams.set("latitude", state.city.lat);
        url.searchParams.set("longitude", state.city.lon);
        url.searchParams.set("current_weather", "true");
        url.searchParams.set("daily", "temperature_2m_max,temperature_2m_min,weathercode");
        url.searchParams.set("timezone", state.city.timezone || 'auto');
        const r = await fetch(url);
        const data = await r.json();
        $("#cityBlock").innerHTML = weatherBlock(data, state.city.name, state.city.timezone, false);
    } catch (e) {
        logLine('error', 'weather failed');
    }
}

export async function refreshIran() {
    try {
        const url = new URL("https://api.open-meteo.com/v1/forecast");
        url.searchParams.set("latitude", 35.6892);
        url.searchParams.set("longitude", 51.3890);
        url.searchParams.set("current_weather", "true");
        url.searchParams.set("daily", "temperature_2m_max,temperature_2m_min,weathercode");
        url.searchParams.set("timezone", "Asia/Tehran");
        const r = await fetch(url);
        const data = await r.json();
        $("#iranBlock").innerHTML = weatherBlock(data, "Tehran", "Asia/Tehran", true);
    } catch (e) {
        logLine('error', 'tehran weather failed');
    }
}

function weatherBlock(data, label, tz, jalali) {
    const map = { 0: '☀️', 1: '🌤️', 2: '⛅', 3: '☁️', 45: '🌫️', 48: '🌫️', 51: '🌦️', 53: '🌦️', 55: '🌦️', 56: '🌧️', 57: '🌧️', 61: '🌧️', 63: '🌧️', 65: '🌧️', 66: '🌧️', 67: '🌧️', 71: '❄️', 73: '❄️', 75: '❄️', 77: '🌨️', 80: '🌧️', 81: '🌧️', 82: '🌧️', 85: '❄️', 86: '❄️', 95: '⛈️', 96: '⛈️', 99: '⛈️' };
    const cw = data?.current_weather || {};
    const min = data?.daily?.temperature_2m_min?.[0], max = data?.daily?.temperature_2m_max?.[0];
    const icon = map[cw.weathercode] || '🌡️';
    const dateStr = jalali ? jalaliString(new Date(), tz) : new Intl.DateTimeFormat(undefined, { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short', timeZone: tz }).format(new Date());

    return `<div class="weathertime">
    <div class="left"><div class="iconbig">${icon}</div><div class="tempbig">${Math.round(cw.temperature || 0)}°</div></div>
    <div class="right"><div class="timebig" data-tz="${tz}"></div></div>
  </div>
  <div class="weathertime">
    <div class="subrow">Wind ${Math.round(cw.windspeed || 0)} km/h</div><div class="subrow">Today: ${min != null ? Math.round(min) : '-'}° / ${max != null ? Math.round(max) : '-'}°</div>
  </div>
  <div class="weathertime">
    <div class="subrow"><span class="datebold" data-date="${tz}" data-j="${jalali ? '1' : '0'}">${dateStr}</span><br><span class="tzsmall">TZ: ${tz}</span> . <span class="tzsmall">${label}</span></div>
  </div>`;
}

export function updateTimeIn(root) {
    if (!root) return;
    root.querySelectorAll('.timebig').forEach(el => {
        const tz = el.getAttribute('data-tz');
        el.textContent = '🕒 ' + new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false, timeZone: tz }).format(new Date());
    });
    root.querySelectorAll('[data-date]').forEach(el => {
        const tz = el.getAttribute('data-date');
        const jal = el.getAttribute('data-j') === '1';
        el.textContent = jal ? jalaliString(new Date(), tz) : new Intl.DateTimeFormat(undefined, { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short', timeZone: tz }).format(new Date());
    });
}

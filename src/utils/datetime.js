function div(a, b) { return Math.floor(a / b); }

function gregorianToJdn(gy, gm, gd) {
    let a = div(14 - gm, 12), y = gy + 4800 - a, m = gm + 12 * a - 3;
    return gd + div(153 * m + 2, 5) + 365 * y + div(y, 4) - div(y, 100) + div(y, 400) - 32045;
}

function jalaaliToJdn(jy, jm, jd) {
    let epbase = jy - (jy >= 0 ? 474 : 473), epyear = 474 + (epbase % 2820);
    return jd + (jm <= 7 ? (jm - 1) * 31 : (jm - 7) * 30 + 186) + div((epyear * 682 - 110), 2816) + (epyear - 1) * 365 + div(epbase, 2820) * 1029983 + (1948320 - 1);
}

function jdnToJalaali(jdn) {
    let depoch = jdn - jalaaliToJdn(475, 1, 1), cycle = div(depoch, 1029983), cyear = depoch % 1029983, ycycle;
    if (cyear === 1029982) { ycycle = 2820; } else {
        let aux1 = div(cyear, 366), aux2 = cyear % 366;
        ycycle = div(2134 * aux1 + 2816 * aux2 + 2815, 1028522) + aux1 + 1;
    }
    let jy = ycycle + 2820 * cycle + 474;
    if (jy <= 0) --jy;
    let jdn1f = jalaaliToJdn(jy, 1, 1), jd = jdn - jdn1f + 1, jm = jd <= 186 ? Math.ceil(jd / 31) : Math.ceil((jd - 186) / 30) + 6, firstDay = jd <= 186 ? ((jm - 1) * 31) : (186 + (jm - 7) * 30), day = jd - firstDay;
    return [jy, jm, day];
}

export function jalaliString(date, tz) {
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date).reduce((a, p) => (a[p.type] = p.value, a), {});
    const gy = parseInt(parts.year, 10), gm = parseInt(parts.month, 10), gd = parseInt(parts.day, 10);
    const jdn = gregorianToJdn(gy, gm, gd); const [jy, jm, jd] = jdnToJalaali(jdn);
    const m = ['Farvardin', 'Ordibehesht', 'Khordad', 'Tir', 'Mordad', 'Shahrivar', 'Mehr', 'Aban', 'Azar', 'Dey', 'Bahman', 'Esfand'];
    return `${jd} ${m[jm - 1]} ${jy}`;
}

export function icsToDate(s) {
    if (/\d{8}T\d{6}Z?/.test(s)) {
        const y = s.slice(0, 4), m = s.slice(4, 6), d = s.slice(6, 8), hh = s.slice(9, 11), mi = s.slice(11, 13), ss = s.slice(13, 15);
        const iso = `${y}-${m}-${d}T${hh}:${mi}:${ss}` + (s.endsWith('Z') ? 'Z' : '');
        return new Date(iso);
    }
    if (/\d{8}/.test(s)) {
        const y = s.slice(0, 4), m = s.slice(4, 6), d = s.slice(6, 8);
        return new Date(`${y}-${m}-${d}T00:00:00`);
    }
    return null;
}

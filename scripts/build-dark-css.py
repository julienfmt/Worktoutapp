#!/usr/bin/env python3
"""Generate dark.css from the app stylesheets.

Every rule that hard-codes a light surface, border or dark text colour gets a
`html[data-theme="dark"]` twin with the colour swapped for its dark token.
Rules painting a white chip with navy text (white buttons on the dark hero
cards) are left alone: they already read well on dark.

Run from the repo root:  python3 scripts/build-dark-css.py
"""
import re
from pathlib import Path

SOURCES = ['styles.css', 'streak-score.css', 'theme.css', 'ai-coach.css', 'onboarding.css', 'v6.css']
SCOPE = ':where(html[data-theme="dark"])'

SURFACE = {
    '#ffffff': '#1b1733', '#fff': '#1b1733', 'white': '#1b1733',
    '#f8fafc': '#120f24', '#f1f5f9': '#221d3d', '#f8f7ff': '#1f1a3a',
    '#f5f3ff': '#2a2350', '#ede9fe': '#332a63', '#eef2ff': '#2a2350',
    '#fffbeb': '#2b230f', '#fef3c7': '#3a2e10', '#fff7ed': '#2e1d10',
    '#f0fdf4': '#10261a', '#dcfce7': '#123020', '#fff1f2': '#2e1219',
    '#fee2e2': '#3a1418', '#ffedd5': '#3a2410', '#e0f2fe': '#102a3a',
    '#e2e8f0': '#2a2448', '#cbd5e1': '#2e2850', '#e9e9f6': '#2a2448',
    '#e9e9f5': '#2a2448', '#ececfb': '#2a2448', '#fbfbff': '#1b1733',
    '#fafaff': '#1b1733', '#f7f7fd': '#1f1a3a', '#f4f4fb': '#1f1a3a',
}
LINE = {
    '#ececfb': '#2e2850', '#e4e4f7': '#2a2448', '#e2e8f0': '#2e2850',
    '#e9e9f5': '#2e2850', '#e9e9f6': '#2e2850', '#dcdcf3': '#3a3360',
    '#cbd5e1': '#3a3460', '#f1f5f9': '#221d3d',
}
TEXT = {
    '#0f172a': '#f1f0ff', '#1e293b': '#e7e5ff', '#334155': '#cbd5e1',
    '#475569': '#a9a6cc', '#1e1b4b': '#f1f0ff', '#14532d': '#bbf7d0',
    '#166534': '#86efac', '#78350f': '#fde68a', '#92400e': '#fcd34d',
    '#9a3412': '#fdba74', '#a16207': '#fcd34d', '#c2410c': '#fdba74',
}

COLOR_RE = re.compile(r'#[0-9a-fA-F]{3,8}\b|\bwhite\b')
# Light translucent surfaces (glass cards, tab bar, gradients toward white).
RGBA_RE = re.compile(r'rgba\(\s*(2[3-5]\d)\s*,\s*(2[3-5]\d)\s*,\s*(2[3-5]\d)\s*,\s*(0?\.\d+|1)\s*\)')


def remap_rgba(value):
    def swap(match):
        alpha = float(match.group(4))
        if alpha < 0.5:
            return match.group(0)
        return f'rgba(27, 23, 51, {match.group(4)})'
    return RGBA_RE.sub(swap, value)


def strip_comments(css):
    return re.sub(r'/\*.*?\*/', '', css, flags=re.S)


def iter_rules(css, prefix=''):
    """Yield (at_prefix, selector, body) with one level of @media/@supports."""
    i = 0
    while i < len(css):
        brace = css.find('{', i)
        if brace < 0:
            return
        head = css[i:brace].strip()
        depth = 1
        j = brace + 1
        while j < len(css) and depth:
            if css[j] == '{':
                depth += 1
            elif css[j] == '}':
                depth -= 1
            j += 1
        body = css[brace + 1:j - 1]
        if head.startswith('@media') or head.startswith('@supports'):
            yield from iter_rules(body, head)
        elif head.startswith('@'):
            pass  # keyframes, font-face…
        else:
            yield prefix, head, body
        i = j


def luminance(hex_color):
    h = hex_color.lstrip('#')
    if len(h) == 3:
        h = ''.join(c * 2 for c in h)
    if len(h) not in (6, 8):
        return None
    r, g, b = (int(h[i:i + 2], 16) / 255 for i in (0, 2, 4))
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def remap_value(prop, value, table, light_fallback=None):
    def swap(match):
        color = match.group(0).lower()
        if color in table:
            return table[color]
        if light_fallback and color.startswith('#'):
            lum = luminance(color)
            if lum is not None and lum >= 0.86:
                return light_fallback(lum)
        return match.group(0)
    return COLOR_RE.sub(swap, value)


def surface_for(lum):
    return '#1b1733' if lum >= 0.97 else '#221d3d'


def line_for(lum):
    return '#2e2850'


def convert(body):
    decls = [d.strip() for d in body.split(';') if ':' in d]
    props = {}
    for d in decls:
        p, v = d.split(':', 1)
        props[p.strip().lower()] = v.strip()
    bg = props.get('background', '') + ' ' + props.get('background-color', '')
    text = props.get('color', '').lower()
    white_chip = re.search(r'#fff\b|#ffffff|\bwhite\b', bg) and '#1e1b4b' in text
    # Gradient text (big numbers, titles) is painted through background-clip.
    if 'text' in props.get('-webkit-background-clip', '') or 'text' in props.get('background-clip', ''):
        return []
    out = []
    for d in decls:
        p, v = d.split(':', 1)
        p = p.strip().lower()
        v = v.strip()
        if white_chip:
            continue
        if p in ('background', 'background-color', 'background-image'):
            if 'gradient' in v and not RGBA_RE.search(v) and not any(
                (luminance(c) or 0) >= 0.86 for c in re.findall(r'#[0-9a-f]{3,8}\b', v.lower())
            ) and 'white' not in v.lower():
                continue
            nv = remap_rgba(remap_value(p, v, SURFACE, surface_for))
        elif p.startswith('border') or p in ('outline', 'outline-color'):
            nv = remap_value(p, v, {**LINE, '#fff': '#1b1733', '#ffffff': '#1b1733', 'white': '#1b1733'}, line_for)
        elif p == 'box-shadow':
            nv = remap_value(p, v, {**LINE, '#fcd34d': '#6b4f10', '#fde68a': '#6b4f10', '#bbf7d0': '#14532d', '#fdba74': '#7c2d12', '#c4b5fd': '#4c3a8f'}, line_for)
        elif p in ('color', 'fill', 'stroke'):
            nv = remap_value(p, v, TEXT)
        else:
            continue
        if nv != v:
            out.append(f'    {p}: {nv};')
    return out


def scoped(selector):
    parts = []
    for sel in selector.split(','):
        sel = sel.strip()
        if not sel:
            continue
        if sel.startswith(':root'):
            continue
        if sel.startswith('html') or sel.startswith('body'):
            parts.append(sel.replace('html', SCOPE, 1) if sel.startswith('html') else f'{SCOPE} {sel}')
        else:
            parts.append(f'{SCOPE} {sel}')
    return ',\n'.join(parts)


def main():
    root = Path(__file__).resolve().parent.parent
    chunks = [
        '/* Generated by scripts/build-dark-css.py — do not edit by hand.',
        '   Hand-written dark tokens and tweaks live in the « Dark theme » section of v6.css. */',
        '',
    ]
    for name in SOURCES:
        css = strip_comments((root / name).read_text(encoding='utf-8'))
        for at, selector, body in iter_rules(css):
            decls = convert(body)
            sel = scoped(selector)
            if not decls or not sel:
                continue
            rule = f'{sel} {{\n' + '\n'.join(decls) + '\n}'
            if at:
                rule = f'{at} {{\n' + rule + '\n}'
            chunks.append(rule)
    (root / 'dark.css').write_text('\n\n'.join(chunks) + '\n', encoding='utf-8')
    print('dark.css rules:', len(chunks) - 3)


if __name__ == '__main__':
    main()

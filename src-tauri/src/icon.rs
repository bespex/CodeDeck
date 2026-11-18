//! An icon of its own for each window, so that windows of several projects can be told apart in the
//! taskbar (user, 2026-11-17): the CodeDeck mark and a stripe in the project's colour. What waits is
//! marked in the shapes and sizes every be spex app uses (Maillet's tray), in CodeDeck's colours: a
//! pill with the number of sessions that ask, top right, in the amber of "asks", and a dot for a
//! finished turn, bottom right, in the green of "done". Drawn here, no image files.
//! Spike: whether the desktop's window list shows a window's own icon is to be tried (docs/PLAN.md).

use std::path::Path;

use tauri::image::Image;

const SIZE: u32 = 64;

/// Project colours: the session colours of the interface, so they fit the themes.
const COLORS: [[u8; 3]; 8] = [
    [0x7f, 0x95, 0xff],
    [0x4f, 0xc9, 0xbd],
    [0xe3, 0x91, 0xd0],
    [0xc3, 0xcf, 0x6c],
    [0x62, 0xb6, 0xee],
    [0xc0, 0x8c, 0xf5],
    [0xf0, 0xa0, 0x60],
    [0x6c, 0xc5, 0x8e],
];
/// "Asks" and "done" as everywhere in CodeDeck, RGBA; the pill's digits dark, they read on the amber
const ASKS: [u8; 4] = [0xe0, 0xa8, 0x68, 255];
const DONE: [u8; 4] = [0x6c, 0xc5, 0x8e, 255];
const INK: [u8; 4] = [0x14, 0x16, 0x1a, 255];
const WHITE: [u8; 4] = [255, 255, 255, 255];

/// A colour that stays the same for a project: from its path.
pub fn project_color(root: &Path) -> [u8; 3] {
    // FNV-1a: stable across builds, unlike the standard hasher
    let hash = root.to_string_lossy().bytes().fold(0xcbf2_9ce4_8422_2325_u64, |h, b| (h ^ b as u64).wrapping_mul(0x100_0000_01b3));
    COLORS[(hash % COLORS.len() as u64) as usize]
}

/// The icon for a window: its project's colour, and what waits there.
pub fn render(color: [u8; 3], asks: usize, done: bool) -> Image<'static> {
    let mut rgba = vec![0u8; (SIZE * SIZE * 4) as usize];
    let s = SIZE as f32;
    for y in 0..SIZE {
        for x in 0..SIZE {
            let (fx, fy) = (x as f32 + 0.5, y as f32 + 0.5);
            // Rounded square, a diagonal gradient like the app icon
            let cover = rounded(fx, fy, 2.0, 2.0, s - 4.0, s - 4.0, 13.0);
            if cover <= 0.0 {
                continue;
            }
            let t = (fx + fy) / (2.0 * s);
            let mut c = mix([0x3b, 0x3f, 0x8f], [0x1e, 0x5f, 0x5a], t);
            // The project's stripe along the bottom
            if fy > s - 17.0 {
                c = color;
            }
            // The mark: a diamond in the middle, above the stripe
            let (cx, cy) = (s / 2.0, s / 2.0 - 5.0);
            let d = (fx - cx).abs() + (fy - cy).abs();
            if d < 15.0 {
                c = mix(c, [0xee, 0xf0, 0xf3], (15.0 - d).min(1.0));
            }
            let i = ((y * SIZE + x) * 4) as usize;
            rgba[i..i + 4].copy_from_slice(&[c[0], c[1], c[2], (cover * 255.0) as u8]);
        }
    }
    mark_waiting(&mut rgba, SIZE as i32, asks, done);
    Image::new_owned(rgba, SIZE, SIZE)
}

/// What waits, on a square RGBA icon: the pill with the number of asking sessions, the dot for a
/// finished turn. Sizes and shapes as in Maillet (32 px base, scaled in whole steps for larger
/// icons), so every be spex app marks its icon alike; the frontend draws the same (`marks.ts`).
pub fn mark_waiting(rgba: &mut [u8], size: i32, asks: usize, done: bool) {
    if asks > 0 {
        draw_badge(rgba, size, asks);
    }
    if done {
        draw_dot(rgba, size, DONE);
    }
}

/// 3×5 pixel digits, one row per entry, bits from the left (Maillet's).
const DIGITS: [[u8; 5]; 10] = [
    [7, 5, 5, 5, 7],
    [2, 6, 2, 2, 7],
    [7, 1, 7, 4, 7],
    [7, 1, 7, 1, 7],
    [5, 5, 7, 1, 1],
    [7, 4, 7, 1, 7],
    [7, 4, 7, 5, 7],
    [7, 1, 1, 1, 1],
    [7, 5, 7, 5, 7],
    [7, 5, 7, 1, 7],
];

/// The pill with the count in the top right corner: half the icon high, at least round.
fn draw_badge(data: &mut [u8], size: i32, count: usize) {
    let s = (size / 32).max(1);
    let text = count.min(99).to_string();
    let h = 16 * s;
    let w = ((text.len() as i32 * 8 + 6) * s).max(h);
    let (x0, r) = (size - w, h / 2);
    let mut set = |x: i32, y: i32, px: [u8; 4]| {
        if (0..size).contains(&x) && (0..size).contains(&y) {
            let i = ((y * size + x) * 4) as usize;
            data[i..i + 4].copy_from_slice(&px);
        }
    };
    for y in 0..h {
        for x in x0..size {
            // Rounded ends: inside if within the end circles or the straight middle
            let cx = (x - x0).clamp(r, w - r) + x0;
            if (x - cx).pow(2) + (y - r).pow(2) <= r * r {
                set(x, y, ASKS);
            }
        }
    }
    // The digits centred in the pill, each 6 px wide plus a gap of 2
    let mut cx = x0 + (w - (text.len() as i32 * 8 - 2) * s) / 2;
    for ch in text.chars() {
        let rows = DIGITS[ch.to_digit(10).unwrap_or(0) as usize];
        for (row, bits) in rows.iter().enumerate() {
            for col in 0..3 {
                if bits & (4 >> col) != 0 {
                    for dy in 0..2 * s {
                        for dx in 0..2 * s {
                            set(cx + col * 2 * s + dx, 3 * s + row as i32 * 2 * s + dy, INK);
                        }
                    }
                }
            }
        }
        cx += 8 * s;
    }
}

/// The dot in the bottom right corner, with a white ring so it reads on light and dark panels.
fn draw_dot(data: &mut [u8], size: i32, color: [u8; 4]) {
    let s = (size / 32).max(1);
    let (outer, inner) = (6 * s, 4 * s + s / 2);
    let (cx, cy) = (size - outer, size - outer);
    for y in cy - outer..=cy + outer {
        for x in cx - outer..=cx + outer {
            let d = (x - cx).pow(2) + (y - cy).pow(2);
            if (0..size).contains(&x) && (0..size).contains(&y) && d <= outer * outer {
                let i = ((y * size + x) * 4) as usize;
                data[i..i + 4].copy_from_slice(if d <= inner * inner { &color } else { &WHITE });
            }
        }
    }
}

/// How much of the pixel at `x`, `y` lies inside a rounded rectangle (0 to 1, a soft edge).
fn rounded(x: f32, y: f32, left: f32, top: f32, w: f32, h: f32, r: f32) -> f32 {
    let cx = x.clamp(left + r, left + w - r);
    let cy = y.clamp(top + r, top + h - r);
    let d = ((x - cx).powi(2) + (y - cy).powi(2)).sqrt();
    (r - d + 0.5).clamp(0.0, 1.0)
}

fn mix(a: [u8; 3], b: [u8; 3], t: f32) -> [u8; 3] {
    let t = t.clamp(0.0, 1.0);
    [0, 1, 2].map(|i| (a[i] as f32 + (b[i] as f32 - a[i] as f32) * t).round() as u8)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_project_keeps_its_colour_and_marks_show_what_waits() {
        let p = Path::new("/home/u/projects/orbit-api");
        assert_eq!(project_color(p), project_color(p));
        let plain = render(project_color(p), 0, false);
        assert_eq!(plain.rgba().len(), (SIZE * SIZE * 4) as usize);
        let at = |img: &Image, x: u32, y: u32| img.rgba()[((y * SIZE + x) * 4) as usize..][..4].to_vec();
        // Top right the pill, bottom right the dot's centre, only when there is something
        let marked = render(project_color(p), 3, true);
        assert_eq!(at(&marked, SIZE - 2, 16), ASKS.to_vec());
        assert_eq!(at(&marked, SIZE - 12, SIZE - 12), DONE.to_vec());
        assert_ne!(at(&plain, SIZE - 2, 16), ASKS.to_vec());
        assert_ne!(at(&plain, SIZE - 12, SIZE - 12), DONE.to_vec());
    }

    #[test]
    fn the_marks_stay_inside_and_have_maillets_size() {
        for (size, count) in [(32, 3), (32, 42), (64, 7), (32, 1000)] {
            let mut data = vec![0u8; (size * size * 4) as usize];
            mark_waiting(&mut data, size, count, true);
            let count_of = |c: [u8; 4]| data.chunks(4).filter(|p| *p == c).count();
            let (ink, pill, dot) = (count_of(INK), count_of(ASKS), count_of(DONE));
            assert!(ink > 0 && pill > ink && dot > 10, "size {size}, count {count}");
            // The pill is half the icon high, at the right edge; the bottom left corner stays free
            let edge = |y: i32| data[((y * size + size - 1) * 4) as usize..][..4].to_vec();
            let s = size / 32;
            assert_eq!(edge(8 * s), ASKS.to_vec());
            assert_ne!(edge(16 * s + 1), ASKS.to_vec());
            let i = (((size - 1) * size) * 4) as usize;
            assert_eq!(&data[i..i + 4], &[0, 0, 0, 0]);
        }
    }
}

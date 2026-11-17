//! An icon of its own for each window, so that windows of several projects can be told apart in the
//! taskbar (user, 2026-11-17): the CodeDeck mark, a stripe in the project's colour, and a dot for
//! what waits (amber: a session asks, green: a turn is done). Drawn here, no image files.
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
const ASKS: [u8; 3] = [0xe0, 0xa8, 0x68];
const DONE: [u8; 3] = [0x6c, 0xc5, 0x8e];

/// A colour that stays the same for a project: from its path.
pub fn project_color(root: &Path) -> [u8; 3] {
    // FNV-1a: stable across builds, unlike the standard hasher
    let hash = root.to_string_lossy().bytes().fold(0xcbf2_9ce4_8422_2325_u64, |h, b| (h ^ b as u64).wrapping_mul(0x100_0000_01b3));
    COLORS[(hash % COLORS.len() as u64) as usize]
}

/// The icon for a window: its project's colour, and what waits there.
pub fn render(color: [u8; 3], asks: bool, done: bool) -> Image<'static> {
    let dot = if asks { Some(ASKS) } else if done { Some(DONE) } else { None };
    let mut rgba = vec![0u8; (SIZE * SIZE * 4) as usize];
    let s = SIZE as f32;
    for y in 0..SIZE {
        for x in 0..SIZE {
            let (fx, fy) = (x as f32 + 0.5, y as f32 + 0.5);
            let mut px: Option<[u8; 4]> = None;
            // Rounded square, a diagonal gradient like the app icon
            let cover = rounded(fx, fy, 2.0, 2.0, s - 4.0, s - 4.0, 13.0);
            if cover > 0.0 {
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
                    let edge = (15.0 - d).min(1.0);
                    c = mix(c, [0xee, 0xf0, 0xf3], edge);
                }
                px = Some([c[0], c[1], c[2], (cover * 255.0) as u8]);
            }
            // The dot for what waits, top right, with a dark ring so it stands out on any panel
            if let Some(dc) = dot {
                let (cx, cy) = (s - 13.0, 13.0);
                let r = ((fx - cx).powi(2) + (fy - cy).powi(2)).sqrt();
                if r < 13.0 {
                    let ring = [0x14, 0x16, 0x1a];
                    let c = if r < 9.5 { mix(ring, dc, (9.5 - r).min(1.0)) } else { ring };
                    let alpha = ((13.0 - r).min(1.0) * 255.0) as u8;
                    px = Some(match px {
                        Some(under) if alpha < 255 => blend(under, [c[0], c[1], c[2], alpha]),
                        _ => [c[0], c[1], c[2], alpha],
                    });
                }
            }
            if let Some(p) = px {
                let i = ((y * SIZE + x) * 4) as usize;
                rgba[i..i + 4].copy_from_slice(&p);
            }
        }
    }
    Image::new_owned(rgba, SIZE, SIZE)
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

fn blend(under: [u8; 4], over: [u8; 4]) -> [u8; 4] {
    let a = over[3] as f32 / 255.0;
    let c = mix([under[0], under[1], under[2]], [over[0], over[1], over[2]], a);
    [c[0], c[1], c[2], under[3].max(over[3])]
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_project_keeps_its_colour_and_the_dot_shows_what_waits() {
        let p = Path::new("/home/u/projects/orbit-api");
        assert_eq!(project_color(p), project_color(p));
        let plain = render(project_color(p), false, false);
        let asks = render(project_color(p), true, false);
        assert_eq!(plain.rgba().len(), (SIZE * SIZE * 4) as usize);
        // Top right: empty without a dot, amber with one
        let at = |img: &Image, x: u32, y: u32| img.rgba()[((y * SIZE + x) * 4) as usize..][..4].to_vec();
        assert_ne!(at(&plain, SIZE - 13, 13), at(&asks, SIZE - 13, 13));
        assert_eq!(&at(&asks, SIZE - 13, 13)[..3], &ASKS);
    }
}

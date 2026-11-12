/**
 * "The visitor wants to go down": a mouse wheel turned down, a finger swiped up, or a key that scrolls.
 * The landing page uses these to move on to the map, as if scrolling to the next screen.
 */

const WHEEL_MIN = 8; // ignore tiny trackpad jitters
const SWIPE_MIN = 40; // pixels

export const wheelGoesDown = (deltaY: number): boolean => deltaY > WHEEL_MIN;

/** A finger moving up the screen scrolls the page down */
export const swipeGoesDown = (startY: number, endY: number): boolean => startY - endY > SWIPE_MIN;

export const keyGoesDown = (key: string): boolean => ['ArrowDown', 'PageDown', 'End', ' '].includes(key);

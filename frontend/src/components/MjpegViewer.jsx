// src/components/MjpegViewer.jsx
import { useEffect, useRef } from "react";

export default function MjpegViewer({ src, className = "", alt = "" }) {
  const imgRef = useRef(null);

  // simple reconnect on error
  useEffect(() => {
    const img = imgRef.current;
    if (!img) return;
    let t;
    const onErr = () => {
      t = setTimeout(() => {
        if (img) img.src = src + (src.includes("?") ? "&" : "?") + "t=" + Date.now();
      }, 600);
    };
    img.addEventListener("error", onErr);
    return () => {
      img.removeEventListener("error", onErr);
      clearTimeout(t);
    };
  }, [src]);

  return (
    <img
      ref={imgRef}
      src={src}
      alt={alt}
      className={`block ${className}`}
      draggable={false}
    />
  );
}

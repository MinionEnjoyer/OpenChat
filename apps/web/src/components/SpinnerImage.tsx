import { useState, type CSSProperties, type ImgHTMLAttributes, type SyntheticEvent } from 'react';
import { OpenChatSpinner } from './OpenChatSpinner';

export function SpinnerImage({
  spinnerSize = 28,
  wrapperStyle,
  style,
  onLoad,
  onError,
  ...imageProps
}: ImgHTMLAttributes<HTMLImageElement> & {
  spinnerSize?: number;
  wrapperStyle?: CSSProperties;
}) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);

  function handleLoad(event: SyntheticEvent<HTMLImageElement>) {
    setLoaded(true);
    onLoad?.(event);
  }

  function handleError(event: SyntheticEvent<HTMLImageElement>) {
    setFailed(true);
    onError?.(event);
  }

  return (
    <span className="oc-spinner-image" style={wrapperStyle} aria-busy={!loaded && !failed}>
      {!loaded && !failed && <OpenChatSpinner size={spinnerSize} label="Loading image" />}
      <img
        {...imageProps}
        onLoad={handleLoad}
        onError={handleError}
        style={{ ...style, opacity: loaded || failed ? 1 : 0 }}
      />
    </span>
  );
}

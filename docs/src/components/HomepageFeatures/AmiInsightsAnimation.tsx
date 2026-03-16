import React from 'react';

const AmiInsightsAnimation: React.FC = () => {
    return (
        <div style={{ position: 'relative', height: 200, width: 200, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg
                width="200"
                height="200"
                viewBox="0 0 200 200"
                style={{ display: 'block', position: 'absolute' }}
            >
                {/* Meter body */}
                <circle
                    cx="100"
                    cy="100"
                    r="40"
                    fill="none"
                    stroke="var(--ifm-color-primary)"
                    strokeWidth="3"
                />

                {/* Meter inner glow */}
                <circle
                    cx="100"
                    cy="100"
                    r="35"
                    fill="var(--ifm-color-primary)"
                    opacity="0.2"
                />

                {/* Pinging circles with different delays */}
                <circle className="ping ping-1" cx="100" cy="100" r="40" fill="none" stroke="var(--ifm-color-primary)" strokeWidth="2" />
                <circle className="ping ping-2" cx="100" cy="100" r="40" fill="none" stroke="var(--ifm-color-primary)" strokeWidth="2" />
                <circle className="ping ping-3" cx="100" cy="100" r="40" fill="none" stroke="var(--ifm-color-primary)" strokeWidth="2" />
            </svg>

            <style>{`
                .ping {
                    opacity: 0;
                    transform-origin: center;
                    animation: ping-wave 3s infinite cubic-bezier(0, 0, 0.2, 1);
                }
                .ping-1 { animation-delay: 0s; }
                .ping-2 { animation-delay: 1s; }
                .ping-3 { animation-delay: 2s; }

                @keyframes ping-wave {
                    0% {
                        r: 40;
                        opacity: 0.8;
                        stroke-width: 2;
                    }
                    100% {
                        r: 100;
                        opacity: 0;
                        stroke-width: 1;
                    }
                }
            `}</style>
        </div>
    );
};

export default AmiInsightsAnimation;

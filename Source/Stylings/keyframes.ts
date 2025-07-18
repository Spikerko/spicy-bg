export default `
    @keyframes BackgroundRotation {
        0% {
            transform: rotate(var(--rotation-strength, 0deg));
        }
        100% {
            transform: rotate(calc(360deg - var(--rotation-strength, 0deg)));
        }
    }

    @keyframes GenericModal_ScaleIn {
        0% {
            scale: 0;
        }
        50% {
            scale: 1;
        }
        65% {
            scale: 1.025;
        }
        100% {
            scale: 1;
        }
    }

    @keyframes skeleton {
        to {
            background-position-x: 0
        }
    }
`;

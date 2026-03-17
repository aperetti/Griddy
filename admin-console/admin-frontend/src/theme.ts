import { createTheme } from '@mantine/core';

export const theme = createTheme({
  primaryColor: 'blue',
  defaultRadius: 'md',
  components: {
    Paper: {
      defaultProps: {
        shadow: 'md',
        withBorder: true,
        p: 'md',
      },
      styles: {
        root: {
          backgroundColor: 'rgba(26, 27, 30, 0.7)',
          backdropFilter: 'blur(10px)',
          borderColor: 'rgba(255, 255, 255, 0.1)',
        },
      },
    },
    Button: {
      defaultProps: {
        radius: 'md',
      },
    },
  },
});

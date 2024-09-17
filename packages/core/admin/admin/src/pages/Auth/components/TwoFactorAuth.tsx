import * as React from 'react';

import { Box, Button, Checkbox, Flex, Main, TextInput, Typography,LinkButton } from '@strapi/design-system';
import { Link } from '@strapi/design-system/v2';
import { Form, translatedErrors, useQuery } from '@strapi/helper-plugin';
import { Eye, EyeStriked } from '@strapi/icons';
import { Formik } from 'formik';
import camelCase from 'lodash/camelCase';
import { useIntl } from 'react-intl';
import { NavLink, useHistory } from 'react-router-dom';
import styled from 'styled-components';
import * as yup from 'yup';

import { Logo } from '../../../components/UnauthenticatedLogo';
import { useAuth } from '../../../features/Auth';
import {
  UnauthenticatedLayout,
  Column,
  LayoutContent,
} from '../../../layouts/UnauthenticatedLayout';

import { FieldActionWrapper } from './FieldActionWrapper';

import type { Login } from '../../../../../shared/contracts/authentication';

interface LoginProps {
  children?: React.ReactNode;
}

const LOGIN_SCHEMA = yup.object().shape({
  email: yup.string().email(translatedErrors.email).required(translatedErrors.required),
  password: yup.string().required(translatedErrors.required),
  rememberMe: yup.bool().nullable(),
});

const TwoFactorAuth = ({ children }: LoginProps) => {
  const [apiError, setApiError] = React.useState<string>();
  const [passwordShown, setPasswordShown] = React.useState(false);
  const { formatMessage } = useIntl();
  const query = useQuery();
  const { push } = useHistory();

  const { login } = useAuth('Login');

  const handleLogin = async (body: Parameters<any>[0]) => {
    setApiError(undefined);

    // @ts-ignore
    const res = await login(body);

    if ('error' in res) {
      const message = res.error.message ?? 'Something went wrong';

      if (camelCase(message).toLowerCase() === 'usernotactive') {
        push('/auth/oops');
        return;
      }

      setApiError(message);
    } else {
      const redirectTo = query.get('redirectTo');
      const redirectUrl = redirectTo ? decodeURIComponent(redirectTo) : '/';

      push(redirectUrl);
    }
  };

  return (
    <UnauthenticatedLayout>
      <Main>
        <LayoutContent>
          <Column>
            <Logo />
            <Box paddingTop={6} paddingBottom={1}>
              <Typography variant="alpha" as="h1">
               Verify OTP
              </Typography>
            </Box>
          
            {apiError ? (
              <Typography id="global-form-error" role="alert" tabIndex={-1} textColor="danger600">
                {apiError}
              </Typography>
            ) : null}
          </Column>
          <Formik
            enableReinitialize
            initialValues={{
              otp: '',
            }}
            onSubmit={(values) => {
              handleLogin(values);
            }}
         
            validateOnChange={false}
          >
            {({ values, errors, handleChange }) => (
              <Form>
                <Flex direction="column" alignItems="stretch" gap={6}>
                  <TextInput
                    error={
                      errors.otp
                        ? formatMessage({
                            id: errors.otp,
                            defaultMessage: 'Please enter OTP.',
                          })
                        : ''
                    }
                    label={"OTP"}
                    value={values.otp}
                    onChange={handleChange}
                   
                    placeholder={"Enter OTP"}
                    name="otp"
                    required
                  />
                  <Box paddingBottom={4}>
                    <Flex justifyContent="space-between" alignItems="center">

                      <Typography variant="epsilon" textColor="neutral600">
                        Time Remaing 01:52
                      </Typography>

                      <LinkButton href="#" variant='secondary'>Resend OTP</LinkButton>


                    </Flex>
                  </Box>
                  
                    
                  <Button fullWidth type="submit">
                   SUBMIT
                  </Button>
                </Flex>
              </Form>
            )}
          </Formik>
          {children}
        </LayoutContent>
      
      </Main>
    </UnauthenticatedLayout>
  );
};

const PasswordInput = styled(TextInput)`
  ::-ms-reveal {
    display: none;
  }
`;

export { TwoFactorAuth };
export type { LoginProps };

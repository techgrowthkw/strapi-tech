import * as React from 'react';

import { Box, Button, Checkbox, Flex, Main, TextInput, Typography, LinkButton } from '@strapi/design-system';
import { Link } from '@strapi/design-system/v2';
import { Form, translatedErrors, useQuery,useAPIErrorHandler, useNotification, } from '@strapi/helper-plugin';
import { Eye, EyeStriked } from '@strapi/icons';
import { Formik } from 'formik';
import camelCase from 'lodash/camelCase';
import { useIntl } from 'react-intl';
import { NavLink, useHistory } from 'react-router-dom';
import styled from 'styled-components';
import * as yup from 'yup';

import { isBaseQueryError } from '../../../utils/baseQuery';
import {
  useGetRegistrationInfoQuery,
  useRegisterAdminMutation,
  useRegisterUserMutation,
} from '../../../services/auth';
import { Logo } from '../../../components/UnauthenticatedLogo';
import { useAuth } from '../../../features/Auth';
import {
  UnauthenticatedLayout,
  Column,
  LayoutContent,
} from '../../../layouts/UnauthenticatedLayout';
import {
  useVerifyOtpMutation,
  useResendOtpMutation,
  useCheckOtpExpMutation
} from '../../../services/auth';

const OTP_SCHEMA = yup.object().shape({
  otp: yup.string().required()
 
});

interface TwoFactoProps {
  hasAdmin?: boolean;
}



const TwoFactorAuth = ({ hasAdmin }: TwoFactoProps) => {
  const [apiError, setApiError] = React.useState<string>();
  const [apiSuccess, setApiSuccess] = React.useState<string>('OTP code has been sent vis SMS');
  const [verify, setVerify] = React.useState<boolean>(false);

  const { formatMessage } = useIntl();
  const query = useQuery();
  const { push } = useHistory();

  const {
    _unstableFormatAPIError: formatAPIError, 
    _unstableFormatValidationErrors: formatValidationErrors,
  } = useAPIErrorHandler();
  const [verifyOtp] = useVerifyOtpMutation();
  const [resendOtp] = useResendOtpMutation()
  const [chechExp] = useCheckOtpExpMutation()
  // const duration = 1800;
  const duration = 60;
  const tempToken = query.get('temp');
  const [timeRemaining, setTimeRemaining] = React.useState<number>(duration);
  const [resendBtnStatus, setResendBtnStatus] = React.useState<boolean>(true);
  const intervalRef = React.useRef<NodeJS.Timeout | null>(null);
  const { setToken } = useAuth('Register');
 

  React.useEffect(() => {
    // If timeRemaining reaches 0, stop the countdown
    if (timeRemaining <= 0) {
      clearInterval(intervalRef.current!);
      handleResend(false)
      setResendBtnStatus(false)
      // push('/');
      return;
    }

    // Update the countdown every second
    intervalRef.current = setInterval(() => {
      setTimeRemaining(prevTime => prevTime - 1);
    }, 1000);

    // Cleanup interval on component unmount
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [timeRemaining]);



  const { data: userInfo, error } = useGetRegistrationInfoQuery(tempToken as string, {
    skip: !tempToken,
  });
  React.useEffect(() => {
   
    if (error || !tempToken) {
   
      push(`/auth/login`);
    }
   
   ;
  }, [error, formatAPIError, push,tempToken ]);

  React.useEffect(() => {
    // Define a function to check token expiration
    const checkToken = async () => {
      const token = await isTokenExpired(tempToken) ; // Check if the token is expired
      if (token) {
        const message = 'OTP Expired';
        push(`/auth/oops?info=${encodeURIComponent(message)}`); // Redirect on expiration
        return;
      }
    };
  
    // Set interval to run the check every 5 seconds (5000ms)
    const intervalId = setInterval(() => {
      checkToken();
    }, 5000);
  
    // Clear the interval when the component unmounts
    return () => clearInterval(intervalId);
  
  }, [tempToken, push]);

  const resetTimer = () => {
    setResendBtnStatus(true)
    if (intervalRef.current) {
      clearInterval(intervalRef.current); // Clear the existing interval
    }
    setTimeRemaining(duration); // Reset time to 1 hour
  };
    // Helper function to format time (HH:MM)
  const formatTime = (time: number): string => {
    const minutes = Math.floor(time / 60);
    const seconds = time % 60;
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  };

  const handleLogin = async (body: { otp: string }) => {
    const vals = { code: body.otp, tempToken: tempToken?.toString() || '' }

    const res = await verifyOtp(vals);

    if ('error' in res) {
      const message = res.error.message ?? 'Something went wrong';
      push(`/auth/oops?info=${encodeURIComponent(message)}`);
      return;

      // setApiError(message);
    } else {
     
      setVerify(true)
      setTimeout(()=>{
        setToken(res.data.token)
        push('/');
        // const redirectTo = query.get('redirectTo');
        // const redirectUrl = redirectTo ? decodeURIComponent(redirectTo) : '/';
  
        // push(redirectUrl);
      },2000)

    }
  };


  const isTokenExpired = async (token: string | null) => {
    // const jwt = require('jsonwebtoken');Your session has expired. Please log in again.
    if(!token){
      return false
    }
    const vals = { token: token }
    const res = await chechExp(vals)
    if ('error' in res) {
     //Your session has expired. Please log in again.
      return true;

    } 
     
    return false

    
    
  };


  const handleResend = async (isTimeUp: boolean = false) => {
    const vals = { isEmail: isTimeUp , tempToken: tempToken?.toString() || '' }

    const res = await resendOtp(vals);

  
    if ('error' in res) {
      const message = res.error.message ?? 'OTP Expired';
      push(`/auth/oops?info=${encodeURIComponent(message)}`);
      return;
      // setApiError(message);
    } else {
      if(isTimeUp){
       
        resetTimer()
        setApiSuccess('otp sent successfully');
      }
     
     

    }
  };

  const handleButtonResend = (event: React.MouseEvent<HTMLButtonElement, MouseEvent>) => {
    event.preventDefault();
    handleResend(true);
  };



  return (
    <UnauthenticatedLayout>
      <Main>
        <LayoutContent>


          {verify ? (<>
            <Column>
                <Logo />


                <Box paddingTop={6} paddingBottom={1}>
                  <Typography variant="alpha" as="h1">
                   You are Verified
                  </Typography>

                 
                </Box>
                <Box paddingTop={6} paddingBottom={1}>
                <Typography variant="alpha" as="h5">
                    signing in ....
                  </Typography>
                 
                </Box>

             
              </Column>
          </>)

            : (<>
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
                {
                  apiSuccess ? (
                    <Typography id="global-form-error" role="alert" tabIndex={-1} textColor="success600">
                      {apiSuccess}
                    </Typography>
                  ) : null
                }
              </Column>
              <Formik
                enableReinitialize
                initialValues={{
                  otp: '',
                }}
                onSubmit={(values) => {
                  handleLogin(values);
                }}
                validationSchema={OTP_SCHEMA}
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
                            Time Remaing {formatTime(timeRemaining)}
                          </Typography>

                          <Button disabled={resendBtnStatus}  variant='secondary' onClick={handleButtonResend}>Resend OTP</Button>


                        </Flex>
                      </Box>


                      <Button fullWidth type="submit">
                        SUBMIT
                      </Button>
                    </Flex>
                  </Form>
                )}
              </Formik>

            </>)}


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
export type { TwoFactoProps };

